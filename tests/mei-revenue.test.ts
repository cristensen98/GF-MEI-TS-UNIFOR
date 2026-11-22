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

test('usa os meses do ano da abertura a partir do próprio mês, inclusive', () => {
    const july = meiThresholds(2026, '2026-07');
    assert.ok(july);
    assert.equal(july.proportional, true);
    assert.equal(july.ceiling, 4_050_000);
    assert.equal(july.excessBoundary, 4_860_000);
    assert.equal(revenueBand(4_050_000n, july).label, 'Dentro do teto');
    assert.equal(revenueBand(4_050_001n, july).label, 'Excesso de até 20%');
    assert.equal(revenueBand(4_860_000n, july).label, 'Excesso de até 20%');
    assert.equal(revenueBand(4_860_001n, july).label, 'Excesso acima de 20%');
    assert.equal(meiThresholds(2026, '2026-01')?.ceiling, 8_100_000);
    assert.equal(meiThresholds(2026, '2026-12')?.ceiling, 675_000);
    assert.deepEqual(meiThresholds(2027, '2026-07'), meiThresholds(2027));
    assert.deepEqual(meiThresholds(2026, null), meiThresholds(2026));
    assert.equal(meiThresholds(2025, '2026-07'), null);
});

test('usa os valores mensais previstos em lei e compara apenas centavos inteiros', () => {
    const july = meiThresholds(2027, '2027-07');
    assert.ok(july);
    assert.equal(july.projected, true);
    assert.equal(july.ceiling, 5_500_002);
    assert.equal(july.excessBoundary, 6_600_002);
    assert.equal(revenueBand(6_600_002n, july).label, 'Excesso de até 20%');
    assert.equal(revenueBand(6_600_003n, july).label, 'Excesso acima de 20%');
    assert.equal(meiThresholds(2028, '2028-12')?.ceiling, 1_166_667);
});

test('não classifica o período anterior à abertura e mantém o histórico registrado', () => {
    const entry: Entry = {
        id: 1, descricao: 'Serviço', detalhe: null, data: '2026-06-10', valor: 100,
        custoMaterial: null, servico: null, pagamento: null, cancelado: false
    };
    const points = recordedRevenue(['2025-12', '2026-06', '2026-07', '2027-01'], [
        entry,
        { ...entry, id: 2, data: '2026-07-10', valor: 4_999_900 }
    ], '2026-07');
    assert.deepEqual(points.map(point => point.total), [0n, 100n, 5_000_000n, 0n]);
    assert.equal(points[0].thresholds, null);
    assert.equal(points[1].band, null);
    assert.equal(points[2].band?.label, 'Excesso acima de 20%');
    assert.equal(points[3].thresholds?.proportional, false);
    assert.equal(points[3].thresholds?.ceiling, 11_000_000);
});
