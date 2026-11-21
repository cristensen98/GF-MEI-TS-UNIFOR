import { useEffect, useState } from 'react';
import type { Entry } from '../domain/model.ts';
import { serviceTotal } from '../domain/model.ts';
import { formatMoney, request } from './client.ts';
import type { MonthSummary } from './summary.tsx';
import { AnnualEvolution } from './annual-evolution.tsx';

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const palette = ['#087565', '#6746a4', '#195e89', '#a04d1b', '#85405e'];

function monthsBefore(month: string, count: number) {
    const date = new Date(month + '-01T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() - count);
    return date.getUTCFullYear() < 0 ? '' : date.toISOString().slice(0, 7);
}

function Donut({ title, values }: { title: string; values: [string, number][] }) {
    const total = values.reduce((sum, [, value]) => sum + value, 0);
    let position = 0;
    const stops = values.map(([, value], index) => {
        const start = position;
        position += value / total * 100;
        return `${palette[index % palette.length]} ${start}% ${position}%`;
    });
    return <section className="dashboard-panel">
        <h3>{title}</h3>
        {total > 0 ? <div className="donut-content">
            <div className="donut" aria-hidden="true" style={{ background: 'conic-gradient(' + stops.join(',') + ')' }}>
                <strong>{formatMoney(total)}</strong>
            </div>
            <ul role="list">{values.map(([name, value], index) => <li key={name}>
                <span className="series-key" aria-hidden="true" style={{ background: palette[index % palette.length] }} />
                <span>{name}</span><strong>{formatMoney(value)} · {percent.format(value / total)}</strong>
            </li>)}</ul>
        </div> : <p className="chart-empty">Sem valores para este período.</p>}
    </section>;
}

export function MonthlyInsights({ month, summary }: { month: string; summary: MonthSummary }) {
    const months = Array.from({ length: 12 }, (_, index) => monthsBefore(month, 11 - index)).filter(Boolean);
    const [history, setHistory] = useState<MonthSummary[] | null>(null);
    const [services, setServices] = useState<Entry[] | null>(null);
    const [serviceValues, setServiceValues] = useState<[string, number][] | null>(null);
    const [historyError, setHistoryError] = useState(false);
    const [servicesError, setServicesError] = useState(false);
    const [revenueError, setRevenueError] = useState(false);

    useEffect(() => {
        let active = true;
        const previousMonths = Array.from({ length: 11 }, (_, index) => monthsBefore(month, 11 - index)).filter(Boolean);
        void Promise.all(previousMonths.map(previous => request<MonthSummary>('resumo/' + previous)))
            .then(results => { if (active) setHistory(results); })
            .catch(() => { if (active) setHistoryError(true); });
        const serviceRequest = request<Entry[]>('servicos');
        void serviceRequest.then(result => { if (active) setServices(result); })
            .catch(() => { if (active) setRevenueError(true); });
        void Promise.all([serviceRequest, request<Entry[]>('recebimentos')])
            .then(([services, receipts]) => {
                if (!active) return;
                const selected = services.filter(entry => !entry.cancelado && entry.data.startsWith(month + '-'));
                const ids = new Set(selected.map(entry => entry.id));
                const contracted = selected.reduce((sum, entry) => sum + serviceTotal(entry), 0);
                const paid = receipts.reduce((sum, entry) => !entry.cancelado && entry.servico !== null &&
                    ids.has(entry.servico) && entry.data.slice(0, 7) <= month ? sum + entry.valor : sum, 0);
                setServiceValues([['Recebido até o fim do mês', paid], ['Em aberto no fim do mês', contracted - paid]]);
            })
            .catch(() => { if (active) setServicesError(true); });
        return () => { active = false; };
    }, [month]);

    const categories = new Map<string, number>();
    for (const entry of summary.despesas) {
        const name = entry.detalhe || 'Sem categoria';
        categories.set(name, (categories.get(name) ?? 0) + entry.valor);
    }
    return <div className="monthly-insights">
        <AnnualEvolution months={months} cash={history && [...history, summary]} services={services}
            cashError={historyError} revenueError={revenueError} />
        <div className="dashboard-charts">
            <Donut title="Composição das despesas pagas" values={[...categories].sort((a, b) => b[1] - a[1])} />
            {serviceValues ? <Donut title="Recebimento dos serviços do mês" values={serviceValues} /> :
                <section className="dashboard-panel"><h3>Recebimento dos serviços do mês</h3>
                    <p role="status">{servicesError ? 'Não foi possível carregar os serviços.' : 'Carregando serviços…'}</p>
                </section>}
        </div>
    </div>;
}
