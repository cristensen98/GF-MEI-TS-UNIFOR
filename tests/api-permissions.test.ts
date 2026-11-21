import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { Ledger } from '../src/domain/ledger.ts';
import { kinds } from '../src/domain/model.ts';
import { api, handleError } from '../src/server/api.ts';
import { SqliteRepository } from '../src/server/sqlite.ts';

test('permite consultas a usuários comuns e reserva alterações ao administrador', async () => {
    const repository = new SqliteRepository(':memory:');
    const ledger = new Ledger(repository);
    const app = express();
    const draft = { descricao: 'Serviço', valor: 10000, data: '2026-11-20' };
    const entry = ledger.save('servicos', draft);
    app.use(express.json());
    app.use('/leitura', (_req, res, next) => { res.locals.session = { administrador: false }; next(); }, api(ledger));
    app.use('/gestao', (_req, res, next) => { res.locals.session = { administrador: true }; next(); }, api(ledger));
    app.use(handleError);
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const base = 'http://127.0.0.1:' + address.port;
        for (const kind of kinds) {
            assert.equal((await fetch(base + '/leitura/' + kind)).status, 200);
            for (const method of ['POST', 'PUT', 'DELETE']) {
                const path = kind + (method === 'POST' ? '' : '/' + entry.id);
                assert.equal((await fetch(base + '/leitura/' + path, { method })).status, 403);
            }
        }
        assert.equal((await fetch(base + '/leitura/servicos/' + entry.id + '/resumo')).status, 200);
        const created = await fetch(base + '/gestao/servicos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft)
        });
        assert.equal(created.status, 201);
        const { id } = await created.json() as { id: number };
        assert.equal((await fetch(base + '/gestao/servicos/' + id, { method: 'DELETE' })).status, 204);
    } finally {
        server.close();
        repository.close();
    }
});
