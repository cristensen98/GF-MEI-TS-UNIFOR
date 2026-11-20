import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/domain/ledger.ts';
import { SqliteRepository } from '../src/server/sqlite.ts';

const service = { descricao: 'Serviço', valor: 30000, data: '2026-04-01' };
const expense = { descricao: 'Material', detalhe: 'Insumos', valor: 8000, data: '2026-04-01' };
const receipt = { descricao: 'Pagamento parcial', valor: 10000, data: '2026-04-02' };

function fixture(t: { after: (cleanup: () => void) => void }) {
    const database = new SqliteRepository(':memory:');
    t.after(() => database.close());
    return new Ledger(database);
}

test('valida lançamentos, consulta e atualiza serviços', t => {
    const ledger = fixture(t);
    assert.throws(() => ledger.save('servicos', { ...service, data: '2026-02-30' }), /data válida/);
    assert.throws(() => ledger.save('servicos', { ...service, valor: 100.5 }), /centavos/);
    const entry = ledger.save('servicos', service);
    assert.equal(ledger.get('servicos', entry.id).valor, 30000);
    assert.equal(ledger.save('servicos', { ...service, valor: 35000 }, entry.id).valor, 35000);
    assert.equal(ledger.list('servicos').length, 1);
});

test('limita recebimentos e preserva o saldo após falha transacional', t => {
    const ledger = fixture(t);
    const entry = ledger.save('servicos', service);
    const draft = { ...receipt, servico: entry.id };
    const first = ledger.save('recebimentos', draft);
    assert.equal(ledger.serviceSummary(entry.id).situacao, 'Parcial');
    assert.throws(() => ledger.save('recebimentos', { ...draft, valor: 20001 }), /excede o saldo/);
    assert.throws(() => ledger.save('servicos', { ...service, valor: 9999 }, entry.id), /inferior/);
    assert.equal(ledger.serviceSummary(entry.id).saldo, 20000);
    ledger.save('recebimentos', { ...draft, valor: 20000 });
    assert.equal(ledger.serviceSummary(entry.id).situacao, 'Quitado');
    ledger.save('recebimentos', draft, first.id);
    assert.equal(ledger.serviceSummary(entry.id).saldo, 0);
});

test('separa custo direto, caixa mensal e cancelamento', t => {
    const ledger = fixture(t);
    const entry = ledger.save('servicos', service);
    const cost = ledger.save('despesas', { ...expense, servico: entry.id });
    assert.equal(ledger.serviceSummary(entry.id).custoDireto, 8000);
    assert.equal(ledger.monthlySummary('2026-04').saidas, 0);
    ledger.save('despesas', { ...expense, servico: entry.id, pagamento: '2026-04-02' }, cost.id);
    ledger.save('despesas', { ...expense, valor: 2000, pagamento: '2026-04-02' });
    ledger.save('recebimentos', { ...receipt, servico: entry.id });
    const second = ledger.save('recebimentos', { ...receipt, servico: entry.id, valor: 20000, data: '2026-05-01' });
    assert.equal(ledger.monthlySummary('2026-04').resultado, 0);
    assert.equal(ledger.monthlySummary('2026-05').resultado, 20000);
    assert.throws(() => ledger.cancel('servicos', entry.id), /ativos/);
    ledger.cancel('recebimentos', second.id);
    ledger.cancel('recebimentos', second.id);
    assert.equal(ledger.get('recebimentos', second.id).cancelado, true);
    assert.equal(ledger.monthlySummary('2026-05').resultado, 0);
    assert.equal(ledger.serviceSummary(entry.id).saldo, 20000);
});

test('recupera registros ao reabrir o arquivo SQLite', t => {
    const directory = mkdtempSync(join(tmpdir(), 'gf-mei-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, 'test.sqlite');
    const first = new SqliteRepository(path);
    const entry = new Ledger(first).save('servicos', service);
    first.close();
    const second = new SqliteRepository(path);
    try {
        assert.equal(new Ledger(second).get('servicos', entry.id).descricao, service.descricao);
    } finally {
        second.close();
    }
});

