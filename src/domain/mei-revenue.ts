import { serviceTotal } from './model.ts';
import type { Entry } from './model.ts';

const openingMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseOpeningMonth(openingMonth?: string | null) {
    return openingMonth && openingMonthPattern.test(openingMonth) ? openingMonth : null;
}

// LC 123/2006, art. 18-A, and LC 238/2026, arts. 1–3 and 10.
export function meiThresholds(year: number, openingMonth?: string | null) {
    const opening = parseOpeningMonth(openingMonth);
    const openingYear = opening ? Number(opening.slice(0, 4)) : null;
    if (year < 2018 || (openingYear !== null && year < openingYear)) return null;

    const annualCeiling = year >= 2028 ? 14_000_000 : year === 2027 ? 11_000_000 : 8_100_000;
    const monthlyCeiling = year >= 2028 ? 1_166_667 : year === 2027 ? 916_667 : 675_000;
    const proportional = opening !== null && year === openingYear;
    const ceiling = proportional ? monthlyCeiling * (13 - Number(opening.slice(5))) : annualCeiling;

    // The last whole cent at or below the exact 120% boundary.
    return { ceiling, excessBoundary: Math.floor(ceiling * 6 / 5), projected: year >= 2027, proportional };
}

export function revenueBand(total: number | bigint, thresholds: NonNullable<ReturnType<typeof meiThresholds>>) {
    if (total <= thresholds.ceiling) return { label: 'Dentro do teto', tone: 'positive' };
    if (total <= thresholds.excessBoundary) return { label: 'Excesso de até 20%', tone: 'pending' };
    return { label: 'Excesso acima de 20%', tone: 'cancelled' };
}

export function recordedRevenue(months: string[], services: Entry[], openingMonth?: string | null) {
    const opening = parseOpeningMonth(openingMonth);
    const byMonth = new Map<string, bigint>();
    for (const service of services) {
        if (service.cancelado) continue;
        const month = service.data.slice(0, 7);
        byMonth.set(month, (byMonth.get(month) ?? 0n) + BigInt(serviceTotal(service)));
    }

    return months.map(month => {
        const year = Number(month.slice(0, 4));
        const monthNumber = Number(month.slice(5, 7));
        let total = 0n;
        for (let index = 1; index <= monthNumber; index++) {
            total += byMonth.get(month.slice(0, 4) + '-' + String(index).padStart(2, '0')) ?? 0n;
        }
        const thresholds = opening && month < opening ? null : meiThresholds(year, opening);
        return { year, monthly: byMonth.get(month) ?? 0n, total, thresholds,
            band: thresholds && revenueBand(total, thresholds) };
    });
}
