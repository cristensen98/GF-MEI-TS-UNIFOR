import { DomainError } from './model.ts';
import type { Entry, Kind, Repository } from './model.ts';
import { parseDraft } from './validation.ts';

export class Ledger {
    private repository: Repository;

    constructor(repository: Repository) {
        this.repository = repository;
    }

    list(kind: Kind) {
        return this.repository.list(kind);
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
            if (id !== undefined && this.get(kind, id).cancelado) {
                throw new DomainError('O lançamento está cancelado.', 409);
            }
            if (draft.servico !== null) {
                const service = this.get('servicos', draft.servico);
                if (service.cancelado) throw new DomainError('O serviço está cancelado.', 409);
                if (kind === 'recebimentos') {
                    const other = this.linked('recebimentos', service.id).filter(entry => entry.id !== id);
                    if (draft.valor > service.valor - total(other)) {
                        throw new DomainError('O recebimento excede o saldo do serviço.', 409);
                    }
                }
            }
            if (kind === 'servicos' && id !== undefined && draft.valor < total(this.linked('recebimentos', id))) {
                throw new DomainError('O valor acordado é inferior ao valor recebido.', 409);
            }
            return id === undefined ? this.repository.create(kind, draft) : this.repository.update(kind, id, draft);
        });
    }

    cancel(kind: Kind, id: number) {
        this.repository.transaction(() => {
            if (this.get(kind, id).cancelado) return;
            if (kind === 'servicos' && (this.linked('despesas', id).length || this.linked('recebimentos', id).length)) {
                throw new DomainError('O serviço ainda tem lançamentos ativos.', 409);
            }
            this.repository.cancel(kind, id);
        });
    }

    serviceSummary(id: number) {
        const service = this.get('servicos', id);
        const recebido = total(this.linked('recebimentos', id));
        const custoDireto = total(this.linked('despesas', id));
        const saldo = service.valor - recebido;
        const situacao = service.cancelado ? 'Cancelado' : saldo === 0 ? 'Quitado' : recebido ? 'Parcial' : 'Em aberto';
        return { recebido, saldo, custoDireto, diferenca: service.valor - custoDireto, situacao };
    }

    monthlySummary(month: string) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            throw new DomainError('Informe o mês no formato AAAA-MM.');
        }
        const datePrefix = month + '-';
        const recebimentos = this.list('recebimentos').filter(entry => !entry.cancelado && entry.data.startsWith(datePrefix));
        const despesas = this.list('despesas').filter(entry => !entry.cancelado && entry.pagamento?.startsWith(datePrefix));
        const entradas = total(recebimentos);
        const saidas = total(despesas);
        return { entradas, saidas, resultado: entradas - saidas, recebimentos, despesas };
    }
}

function total(entries: Entry[]) {
    let cents = 0;
    for (const entry of entries) {
        cents += entry.valor;
        if (!Number.isSafeInteger(cents)) throw new DomainError('O total excede o limite de cálculo.');
    }
    return cents;
}

