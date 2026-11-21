import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDate } from '../src/domain/calendar.ts';
import { amountInput, cents, formatMoney } from '../src/web/client.ts';

test('usa a data de São Paulo na virada do mês em UTC', () => {
    assert.equal(businessDate(new Date('2026-12-01T01:00:00Z')), '2026-11-30');
    assert.equal(businessDate(new Date('2026-12-01T03:00:00Z')), '2026-12-01');
});

test('mantém os centavos na exibição e na edição de valores aceitos pelo sistema', () => {
    const amount = 9_007_199_254_740_990;
    assert.equal(amountInput(amount), '90071992547409,90');
    assert.equal(cents(amountInput(amount)), amount);
    assert.equal(formatMoney(amount).split(',').at(-1), '90');
    assert.match(formatMoney(-1), /^-R\$\s0,01$/);
    assert.equal(amountInput(0), '0,00');
});
