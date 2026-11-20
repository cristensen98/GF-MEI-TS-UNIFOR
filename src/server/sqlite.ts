import { DatabaseSync } from 'node:sqlite';
import type { Draft, Entry, Kind, Repository } from '../domain/model.ts';

function mapEntry(row: Record<string, unknown>): Entry {
    return {
        id: Number(row.id), descricao: String(row.descricao), valor: Number(row.valor),
        detalhe: row.detalhe == null ? null : String(row.detalhe),
        data: String(row.data), servico: row.servico == null ? null : Number(row.servico),
        pagamento: row.pagamento == null ? null : String(row.pagamento),
        cancelado: row.cancelado === 1
    };
}

export class SqliteRepository implements Repository {
    private db: DatabaseSync;

    constructor(path: string) {
        this.db = new DatabaseSync(path);
        this.db.exec(`
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS lancamentos (
                id INTEGER PRIMARY KEY,
                tipo TEXT NOT NULL CHECK (tipo IN ('servicos', 'despesas', 'recebimentos')),
                descricao TEXT NOT NULL,
                detalhe TEXT,
                valor INTEGER NOT NULL CHECK (valor > 0),
                data TEXT NOT NULL,
                servico INTEGER REFERENCES lancamentos(id),
                pagamento TEXT,
                cancelado INTEGER NOT NULL DEFAULT 0 CHECK (cancelado IN (0, 1)),
                CHECK (tipo != 'recebimentos' OR servico IS NOT NULL),
                CHECK (tipo != 'servicos' OR servico IS NULL),
                CHECK (tipo = 'despesas' OR pagamento IS NULL)
            ) STRICT;
            CREATE INDEX IF NOT EXISTS lancamentos_tipo_data ON lancamentos(tipo, data);
        `);
    }

    transaction<T>(action: () => T): T {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = action();
            this.db.exec('COMMIT');
            return result;
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    list(kind: Kind) {
        return this.db.prepare('SELECT * FROM lancamentos WHERE tipo = ? ORDER BY data DESC, id DESC').all(kind).map(mapEntry);
    }

    get(kind: Kind, id: number) {
        const row = this.db.prepare('SELECT * FROM lancamentos WHERE tipo = ? AND id = ?').get(kind, id);
        return row ? mapEntry(row) : undefined;
    }

    create(kind: Kind, draft: Draft): Entry {
        const row = this.db.prepare(`
            INSERT INTO lancamentos (tipo, descricao, detalhe, valor, data, servico, pagamento)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
        `).get(kind, draft.descricao, draft.detalhe, draft.valor, draft.data, draft.servico, draft.pagamento);
        return mapEntry(row!);
    }

    update(kind: Kind, id: number, draft: Draft): Entry {
        const row = this.db.prepare(`
            UPDATE lancamentos SET descricao = ?, detalhe = ?, valor = ?, data = ?, servico = ?, pagamento = ?
            WHERE tipo = ? AND id = ? RETURNING *
        `).get(draft.descricao, draft.detalhe, draft.valor, draft.data, draft.servico, draft.pagamento, kind, id);
        return mapEntry(row!);
    }

    cancel(kind: Kind, id: number) {
        this.db.prepare('UPDATE lancamentos SET cancelado = 1 WHERE tipo = ? AND id = ?').run(kind, id);
    }

    close() {
        this.db.close();
    }
}

