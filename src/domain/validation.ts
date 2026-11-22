import { DomainError } from './model.ts';
import type { Draft, Kind } from './model.ts';

function date(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new DomainError('Informe uma data válida.');
    }
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new DomainError('Informe uma data válida.');
    }
    return value;
}

export function parseDraft(kind: Kind, value: unknown): Draft {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new DomainError('Informe os dados do lançamento.');
    }
    const body = value as Record<string, unknown>;
    if (body.cancelado !== undefined && typeof body.cancelado !== 'boolean') {
        throw new DomainError('Selecione uma situação válida.');
    }
    const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
    if (!descricao || descricao.length > 180) {
        throw new DomainError('Informe uma descrição de até 180 caracteres.');
    }
    if (typeof body.valor !== 'number' || !Number.isSafeInteger(body.valor) || body.valor <= 0) {
        throw new DomainError('Informe um valor positivo em centavos.');
    }
    let servico: number | null = null;
    if (kind !== 'servicos' && (kind === 'recebimentos' || body.servico != null)) {
        if (typeof body.servico !== 'number' || !Number.isSafeInteger(body.servico) || body.servico <= 0) {
            throw new DomainError('Selecione um serviço válido.');
        }
        servico = body.servico;
    }
    const pagamento = kind === 'despesas' && body.pagamento != null ? date(body.pagamento) : null;
    const detalhe = typeof body.detalhe === 'string' ? body.detalhe.trim() : '';
    if (detalhe.length > 120 || (kind === 'despesas' && !detalhe)) {
        throw new DomainError('Informe uma categoria válida para a despesa ou um cliente de até 120 caracteres.');
    }
    if (body.recorrente !== undefined && (kind !== 'despesas' || typeof body.recorrente !== 'boolean')) {
        throw new DomainError('A recorrência mensal é válida apenas para despesas.');
    }
    const custoMaterial = body.custoMaterial;
    if (custoMaterial !== undefined && (kind !== 'servicos' || (custoMaterial !== null &&
        (typeof custoMaterial !== 'number' || !Number.isSafeInteger(custoMaterial) || custoMaterial < 0)))) {
        throw new DomainError('Informe um custo de materiais válido em centavos.');
    }
    return { descricao, detalhe: kind === 'recebimentos' ? null : detalhe || null, valor: body.valor, data: date(body.data),
        servico, pagamento, recorrente: body.recorrente as boolean | undefined, custoMaterial,
        cancelado: body.cancelado as boolean | undefined };
}

