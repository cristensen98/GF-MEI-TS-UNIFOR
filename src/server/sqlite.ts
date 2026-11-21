import { DatabaseSync } from 'node:sqlite';
import type { Draft, Entry, Kind, Repository } from '../domain/model.ts';

function mapEntry(row: Record<string, unknown>): Entry {
    return {
        id: Number(row.id), descricao: String(row.descricao), valor: Number(row.valor),
        detalhe: row.detalhe == null ? null : String(row.detalhe),
        data: String(row.data), servico: row.servico == null ? null : Number(row.servico),
        pagamento: row.pagamento == null ? null : String(row.pagamento),
        cancelado: row.cancelado === 1,
        ...(row.custo_material != null ? { custoMaterial: Number(row.custo_material) } : {}),
        ...(row.recorrencia_desde != null ? { recorrente: true } : {}),
        ...(row.recorrencia_origem != null ? { recorrenciaOrigem: Number(row.recorrencia_origem) } : {})
    };
}

export class SqliteRepository implements Repository {
    private db: DatabaseSync;
    private readonly workspace: string;

    constructor(path: string | DatabaseSync, workspace = 'legacy') {
        this.workspace = workspace;
        if (typeof path !== 'string') {
            this.db = path;
            return;
        }
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
        this.transaction(() => {
            const columns = this.db.prepare('PRAGMA table_info(lancamentos)').all();
            if (!columns.some(column => column.name === 'workspace')) {
                this.db.exec(`ALTER TABLE lancamentos ADD COLUMN workspace TEXT NOT NULL DEFAULT 'legacy';
                    CREATE INDEX lancamentos_workspace_tipo_data ON lancamentos(workspace, tipo, data);`);
            }
            if (!columns.some(column => column.name === 'custo_material')) {
                this.db.exec('ALTER TABLE lancamentos ADD COLUMN custo_material INTEGER CHECK (custo_material >= 0 AND tipo = \'servicos\' OR custo_material IS NULL)');
            }
            if (!columns.some(column => column.name === 'recorrencia_desde')) {
                this.db.exec(`
                    ALTER TABLE lancamentos ADD COLUMN recorrencia_desde TEXT;
                    ALTER TABLE lancamentos ADD COLUMN recorrencia_origem INTEGER REFERENCES lancamentos(id);
                    CREATE UNIQUE INDEX lancamentos_recorrencia_data
                    ON lancamentos(recorrencia_origem, data) WHERE recorrencia_origem IS NOT NULL;
                `);
            }
        });
    }

    forWorkspace(workspace: string) {
        return new SqliteRepository(this.db, workspace);
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
        return this.db.prepare('SELECT * FROM lancamentos WHERE workspace = ? AND tipo = ? ORDER BY data DESC, id DESC')
            .all(this.workspace, kind).map(mapEntry);
    }

    get(kind: Kind, id: number) {
        const row = this.db.prepare('SELECT * FROM lancamentos WHERE workspace = ? AND tipo = ? AND id = ?')
            .get(this.workspace, kind, id);
        return row ? mapEntry(row) : undefined;
    }

    create(kind: Kind, draft: Draft): Entry {
        const row = this.db.prepare(`
            INSERT INTO lancamentos (workspace, tipo, descricao, detalhe, valor, data, servico, pagamento, recorrencia_desde, custo_material)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
        `).get(this.workspace, kind, draft.descricao, draft.detalhe, draft.valor, draft.data, draft.servico, draft.pagamento,
            draft.recorrente ? draft.data : null, draft.custoMaterial ?? null);
        return mapEntry(row!);
    }

    update(kind: Kind, id: number, draft: Draft, today = draft.data): Entry {
        const row = this.db.prepare(`
            UPDATE lancamentos SET descricao = ?, detalhe = ?, valor = ?, data = ?, servico = ?, pagamento = ?,
                recorrencia_desde = CASE WHEN ? THEN COALESCE(recorrencia_desde, ?) END,
                custo_material = CASE WHEN ? THEN ? ELSE custo_material END
            WHERE workspace = ? AND tipo = ? AND id = ? RETURNING *
        `).get(draft.descricao, draft.detalhe, draft.valor, draft.data, draft.servico, draft.pagamento,
            draft.recorrente ? 1 : 0, today, draft.custoMaterial === undefined ? 0 : 1, draft.custoMaterial ?? null, this.workspace, kind, id);
        return mapEntry(row!);
    }

    cancel(kind: Kind, id: number) {
        this.db.prepare('UPDATE lancamentos SET cancelado = 1 WHERE workspace = ? AND tipo = ? AND id = ?')
            .run(this.workspace, kind, id);
    }

    syncRecurringExpenses(today: string) {
        this.db.prepare(`
            WITH RECURSIVE cobrancas(id, mes) AS (
                SELECT origem.id, max(date(origem.data, 'start of month', '+1 month'),
                    date(origem.recorrencia_desde, 'start of month'),
                    COALESCE((SELECT date(max(filha.data), 'start of month', '+1 month')
                        FROM lancamentos filha WHERE filha.workspace = origem.workspace AND filha.recorrencia_origem = origem.id),
                        date(origem.data, 'start of month', '+1 month')))
                FROM lancamentos origem
                WHERE origem.workspace = ? AND origem.tipo = 'despesas' AND origem.recorrencia_desde IS NOT NULL AND origem.cancelado = 0
                UNION ALL
                SELECT id, date(mes, '+1 month') FROM cobrancas WHERE mes < date(?, 'start of month')
            ), vencimentos AS (
                SELECT origem.id, origem.workspace, origem.descricao, origem.detalhe, origem.valor, origem.servico, origem.recorrencia_desde,
                    printf('%s-%02d', substr(mes, 1, 7), min(CAST(substr(origem.data, 9, 2) AS INTEGER),
                        CAST(strftime('%d', date(mes, '+1 month', '-1 day')) AS INTEGER))) AS vencimento
                FROM cobrancas JOIN lancamentos origem ON origem.id = cobrancas.id
                WHERE mes <= date(?, 'start of month')
            )
            INSERT INTO lancamentos (workspace, tipo, descricao, detalhe, valor, data, servico, recorrencia_origem)
            SELECT workspace, 'despesas', descricao, detalhe, valor, vencimento, servico, id FROM vencimentos
            WHERE vencimento BETWEEN recorrencia_desde AND ?
            ORDER BY vencimento, id
            ON CONFLICT(recorrencia_origem, data) WHERE recorrencia_origem IS NOT NULL DO NOTHING
        `).run(this.workspace, today, today, today);
    }

    close() {
        this.db.close();
    }
}

