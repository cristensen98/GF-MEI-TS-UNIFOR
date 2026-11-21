import test from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '../src/domain/model.ts';
import { meiThresholds, recordedRevenue, revenueBand } from '../src/domain/mei-revenue.ts';

test('aplica o teto de cada ano e muda de faixa somente após o limite exato', () => {
    for (const [year, ceiling, boundary] of [
        [2026, 8_100_000, 9_720_000], [2027, 11_000_000, 13_200_000], [2028, 14_000_000, 16_800_000]
    ]) {
        const thresholds = meiThresholds(year);
        assert.ok(thresholds);
        assert.equal(thresholds.ceiling, ceiling);
        assert.equal(thresholds.excessBoundary, boundary);
        assert.equal(thresholds.projected, year >= 2027);
        assert.equal(revenueBand(ceiling, thresholds).label, 'Dentro do teto');
        assert.equal(revenueBand(ceiling + 1, thresholds).label, 'Excesso de até 20%');
        assert.equal(revenueBand(boundary, thresholds).label, 'Excesso de até 20%');
        assert.equal(revenueBand(boundary + 1, thresholds).label, 'Excesso acima de 20%');
    }
});

test('inclui meses anteriores à janela e reinicia o acumulado na virada do ano', () => {
    const entry: Entry = {
        id: 1, descricao: 'Serviço', detalhe: null, data: '2026-01-10', valor: 10_000,
        custoMaterial: 1_000, servico: null, pagamento: null, cancelado: false
    };
    const revenue = recordedRevenue(['2026-11', '2026-12', '2027-01', '2027-02'], [
        entry,
        { ...entry, id: 2, data: '2026-12-10' },
        { ...entry, id: 3, data: '2027-01-10', cancelado: true },
        { ...entry, id: 4, data: '2027-02-10' }
    ]);
    assert.deepEqual(revenue.map(point => [point.monthly, point.total]), [
        [0n, 11_000n], [11_000n, 22_000n], [0n, 0n], [11_000n, 11_000n]
    ]);
    const large = recordedRevenue(['2026-01', '2026-02'], [
        { ...entry, valor: Number.MAX_SAFE_INTEGER, custoMaterial: null },
        { ...entry, id: 2, data: '2026-02-10', valor: 2, custoMaterial: null }
    ]);
    assert.equal(large[1].total, 9_007_199_254_740_993n);
});
