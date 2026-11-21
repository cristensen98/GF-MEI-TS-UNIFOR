import { serviceTotal } from './model.ts';
import type { Entry } from './model.ts';

// Full-year thresholds under LC 123/2006 and LC 238/2026, arts. 2 and 3.
export function meiThresholds(year: number) {
    if (year < 2018) return null;
    const ceiling = year >= 2028 ? 14_000_000 : year === 2027 ? 11_000_000 : 8_100_000;
    return { ceiling, excessBoundary: ceiling * 6 / 5, projected: year >= 2027 };
}

export function revenueBand(total: number | bigint, thresholds: NonNullable<ReturnType<typeof meiThresholds>>) {
    if (total <= thresholds.ceiling) return { label: 'Dentro do teto', tone: 'positive' };
    if (total <= thresholds.excessBoundary) return { label: 'Excesso de até 20%', tone: 'pending' };
    return { label: 'Excesso acima de 20%', tone: 'cancelled' };
}

export function recordedRevenue(months: string[], services: Entry[]) {
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
        const thresholds = meiThresholds(year);
        return { year, monthly: byMonth.get(month) ?? 0n, total, thresholds,
            band: thresholds && revenueBand(total, thresholds) };
    });
}
