import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { Ledger } from '../src/domain/ledger.ts';
import { kinds } from '../src/domain/model.ts';
import { api, handleError } from '../src/server/api.ts';
import { SqliteRepository } from '../src/server/sqlite.ts';

test('isola consultas e alterações por MEI, inclusive para o administrador', async () => {
    const repository = new SqliteRepository(':memory:');
    const first = 'a'.repeat(32);
    const second = 'installation';
    const draft = { descricao: 'Serviço', valor: 10000, data: '2026-11-20' };
    const legacy = new Ledger(repository).save('servicos', draft);
    const app = express();
    app.use(express.json());
    const finance = api(workspace => new Ledger(repository.forWorkspace(workspace)));
    app.use('/primeiro', (_req, res, next) => {
        res.locals.session = { workspace: first, administrador: false };
        next();
    }, finance);
    app.use('/segundo', (_req, res, next) => {
        res.locals.session = { workspace: second, administrador: true };
        next();
    }, finance);
    app.use(handleError);
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const base = 'http://127.0.0.1:' + address.port;
        const json = { 'Content-Type': 'application/json' };
        const created = await fetch(base + '/primeiro/servicos', {
            method: 'POST', headers: json, body: JSON.stringify(draft)
        });
        assert.equal(created.status, 201);
        const { id } = await created.json() as { id: number };
        const receipt = await fetch(base + '/primeiro/recebimentos', {
            method: 'POST', headers: json, body: JSON.stringify({ ...draft, servico: id })
        });
        assert.equal(receipt.status, 201);
        for (const kind of kinds) {
            assert.deepEqual(await (await fetch(base + '/segundo/' + kind)).json(), []);
        }
        for (const suffix of [String(id), id + '/resumo', String(legacy.id)]) {
            assert.equal((await fetch(base + '/segundo/servicos/' + suffix)).status, 404);
        }
        const linked = await fetch(base + '/segundo/recebimentos', {
            method: 'POST', headers: json, body: JSON.stringify({ ...draft, servico: id })
        });
        assert.equal(linked.status, 404);
        for (const method of ['PUT', 'DELETE']) {
            assert.equal((await fetch(base + '/segundo/servicos/' + id, {
                method, headers: json, body: JSON.stringify(draft)
            })).status, 404);
        }
        assert.equal((await (await fetch(base + '/primeiro/resumo/2026-11')).json()).entradas, 10000);
        assert.equal((await (await fetch(base + '/segundo/resumo/2026-11')).json()).entradas, 0);
        const annual = await (await fetch(base + '/primeiro/resumo/anual/2026')).json();
        assert.equal(annual.length, 12);
        assert.deepEqual(annual[10], { entradas: 10000, saidas: 0, resultado: 10000 });
        const otherAnnual = await (await fetch(base + '/segundo/resumo/anual/2026')).json();
        assert.deepEqual(otherAnnual, Array.from({ length: 12 }, () => ({ entradas: 0, saidas: 0, resultado: 0 })));
        assert.equal((await fetch(base + '/primeiro/resumo/anual/invalido')).status, 400);
        assert.equal((await fetch(base + '/primeiro/servicos/' + id, {
            method: 'PUT', headers: json, body: JSON.stringify({ ...draft, descricao: 'Editado' })
        })).status, 200);
        const { id: receiptId } = await receipt.json() as { id: number };
        assert.equal((await fetch(base + '/primeiro/recebimentos/' + receiptId, { method: 'DELETE' })).status, 204);
    } finally {
        server.close();
        repository.close();
    }
});
