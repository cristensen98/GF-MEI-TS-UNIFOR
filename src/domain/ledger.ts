import { DomainError, serviceTotal } from './model.ts';
import type { Entry, Kind, Repository } from './model.ts';
import { parseDraft } from './validation.ts';
import { businessDate } from './calendar.ts';

export class Ledger {
    private repository: Repository;
    private today: () => string;

    constructor(repository: Repository, today = businessDate) {
        this.repository = repository;
        this.today = today;
    }

    list(kind: Kind) {
        if (kind === 'despesas') this.repository.syncRecurringExpenses(this.today());
        const entries = this.repository.list(kind);
        if (kind !== 'servicos') return entries;
        const linkedExpenses = new Map<number, Entry[]>();
        for (const expense of this.list('despesas')) {
            if (expense.cancelado || expense.servico === null) continue;
            const expenses = linkedExpenses.get(expense.servico) ?? [];
            expenses.push(expense);
            linkedExpenses.set(expense.servico, expenses);
        }
        return entries.map(entry => ({
            ...entry, custoDireto: entry.custoMaterial ?? total(linkedExpenses.get(entry.id) ?? [])
        }));
    }

    get(kind: Kind, id: number) {
        const entry = this.repository.get(kind, id);
        if (!entry) throw new DomainError('Lançamento não encontrado.', 404);
        return entry;
    }

    private linked(kind: 'despesas' | 'recebimentos', id: number) {
        return this.list(kind).filter(entry => !entry.cancelado && entry.servico === id);
    }

    save(kind: Kind, body: unknown, id?: number) {
        const draft = parseDraft(kind, body);
        return this.repository.transaction(() => {
            const existing = id === undefined ? undefined : this.get(kind, id);
            if (existing?.cancelado) {
                throw new DomainError('O lançamento está cancelado.', 409);
            }
            if (kind === 'despesas' && existing) {
                if (existing.recorrenciaOrigem && (draft.recorrente || draft.data !== existing.data)) {
                    throw new DomainError('A data e a recorrência de uma cobrança gerada são fixas.');
                }
                if (existing.recorrente && draft.data !== existing.data) {
                    throw new DomainError('Encerre a recorrência e cadastre outra para alterar o dia de cobrança.');
                }
                if (existing.recorrente) this.repository.syncRecurringExpenses(this.today());
                draft.recorrente ??= existing.recorrente;
            }
            if (draft.servico !== null) {
                const service = this.get('servicos', draft.servico);
                if (service.cancelado) throw new DomainError('O serviço está cancelado.', 409);
                if (kind === 'recebimentos') {
                    const other = this.linked('recebimentos', service.id).filter(entry => entry.id !== id);
                    if (draft.valor > serviceTotal(service) - total(other)) {
                        throw new DomainError('O recebimento excede o saldo do serviço.', 409);
                    }
                }
            }
            if (kind === 'servicos') {
                if (draft.custoMaterial === undefined) draft.custoMaterial = existing?.custoMaterial;
                const agreedTotal = serviceTotal(draft);
                if (!Number.isSafeInteger(agreedTotal)) throw new DomainError('O total do serviço excede o limite de cálculo.');
                if (id !== undefined && agreedTotal < total(this.linked('recebimentos', id))) {
                    throw new DomainError('O valor acordado é inferior ao valor recebido.', 409);
                }
            }
            return id === undefined ? this.repository.create(kind, draft) : this.repository.update(kind, id, draft, this.today());
        });
    }

    cancel(kind: Kind, id: number) {
        this.repository.transaction(() => {
            const entry = this.get(kind, id);
            if (entry.cancelado) return;
            if (entry.recorrente) this.repository.syncRecurringExpenses(this.today());
            if (kind === 'servicos' && (this.linked('despesas', id).length || this.linked('recebimentos', id).length)) {
                throw new DomainError('O serviço ainda tem lançamentos ativos.', 409);
            }
            this.repository.cancel(kind, id);
        });
    }

    serviceSummary(id: number) {
        const service = this.get('servicos', id);
        const recebido = total(this.linked('recebimentos', id));
        const custoDireto = service.custoMaterial ?? total(this.linked('despesas', id));
        const agreedTotal = serviceTotal(service);
        const saldo = agreedTotal - recebido;
        const situacao = service.cancelado ? 'Cancelado' : saldo === 0 ? 'Quitado' : recebido ? 'Parcial' : 'Em aberto';
        return { recebido, saldo, custoDireto, diferenca: agreedTotal - custoDireto, situacao };
    }

    monthlySummary(month: string) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            throw new DomainError('Informe o mês no formato AAAA-MM.');
        }
        const datePrefix = month + '-';
        const recebimentos = this.list('recebimentos').filter(entry => !entry.cancelado && entry.data.startsWith(datePrefix));
        const despesas = this.list('despesas').filter(entry => !entry.cancelado && entry.pagamento?.startsWith(datePrefix));
        return { ...cashTotals(recebimentos, despesas), recebimentos, despesas };
    }

    annualCashSummary(year: string) {
        if (!/^\d{4}$/.test(year)) throw new DomainError('Informe o ano no formato AAAA.');

        const months = Array.from({ length: 12 }, () => ({
            receipts: [] as Entry[], expenses: [] as Entry[]
        }));
        for (const receipt of this.list('recebimentos')) {
            if (!receipt.cancelado && receipt.data.startsWith(year + '-')) {
                months[Number(receipt.data.slice(5, 7)) - 1].receipts.push(receipt);
            }
        }
        for (const expense of this.list('despesas')) {
            if (!expense.cancelado && expense.pagamento?.startsWith(year + '-')) {
                months[Number(expense.pagamento.slice(5, 7)) - 1].expenses.push(expense);
            }
        }
        return months.map(({ receipts, expenses }) => cashTotals(receipts, expenses));
    }
}

function cashTotals(receipts: Entry[], expenses: Entry[]) {
    const entradas = total(receipts);
    const saidas = total(expenses);
    return { entradas, saidas, resultado: entradas - saidas };
}

function total(entries: Entry[]) {
    let cents = 0;
    for (const entry of entries) {
        cents += entry.valor;
        if (!Number.isSafeInteger(cents)) throw new DomainError('O total excede o limite de cálculo.');
    }
    return cents;
}

