export const kinds = ['servicos', 'despesas', 'recebimentos'] as const;
export type Kind = typeof kinds[number];

export interface Entry {
    id: number;
    descricao: string;
    detalhe: string | null;
    valor: number;
    data: string;
    servico: number | null;
    pagamento: string | null;
    cancelado: boolean;
}

export type Draft = Omit<Entry, 'id' | 'cancelado'>;

export interface Repository {
    transaction<T>(action: () => T): T;
    list(kind: Kind): Entry[];
    get(kind: Kind, id: number): Entry | undefined;
    create(kind: Kind, data: Draft): Entry;
    update(kind: Kind, id: number, data: Draft): Entry;
    cancel(kind: Kind, id: number): void;
}

export class DomainError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

