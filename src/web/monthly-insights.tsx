import { useEffect, useState } from 'react';
import type { Entry } from '../domain/model.ts';
import { serviceTotal } from '../domain/model.ts';
import { money, request } from './client.ts';
import type { MonthSummary } from './summary.tsx';

const metrics = [
    { key: 'entradas', label: 'Entradas', color: '#087565' },
    { key: 'saidas', label: 'Despesas pagas', color: '#6746a4' },
    { key: 'resultado', label: 'Resultado de caixa', color: '#193c64' }
] as const;
const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const palette = ['#087565', '#6746a4', '#195e89', '#a04d1b', '#85405e'];

function label(month: string) {
    return monthName.format(new Date(month + '-01T00:00:00Z'));
}

function monthsBefore(month: string, count: number) {
    const date = new Date(month + '-01T00:00:00Z');
    date.setUTCMonth(date.getUTCMonth() - count);
    return date.toISOString().slice(0, 7);
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
                <strong>{money.format(total / 100)}</strong>
            </div>
            <ul role="list">{values.map(([name, value], index) => <li key={name}>
                <span className="series-key" aria-hidden="true" style={{ background: palette[index % palette.length] }} />
                <span>{name}</span><strong>{money.format(value / 100)} · {percent.format(value / total)}</strong>
            </li>)}</ul>
        </div> : <p className="chart-empty">Sem valores para este período.</p>}
    </section>;
}

export function MonthlyInsights({ month, summary }: { month: string; summary: MonthSummary }) {
    const months = [5, 4, 3, 2, 1, 0].map(count => monthsBefore(month, count));
    const [history, setHistory] = useState<MonthSummary[] | null>(null);
    const [serviceValues, setServiceValues] = useState<[string, number][] | null>(null);
    const [historyError, setHistoryError] = useState(false);
    const [servicesError, setServicesError] = useState(false);

    useEffect(() => {
        let active = true;
        const previousMonths = [5, 4, 3, 2, 1].map(count => monthsBefore(month, count));
        void Promise.all(previousMonths.map(previous => request<MonthSummary>('resumo/' + previous)))
            .then(results => { if (active) setHistory(results); })
            .catch(() => { if (active) setHistoryError(true); });
        void Promise.all([request<Entry[]>('servicos'), request<Entry[]>('recebimentos')])
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
        {history ? <Evolution months={months} values={[...history, summary]} /> :
            <p role="status">{historyError ? 'Não foi possível carregar o histórico mensal.' : 'Carregando histórico mensal…'}</p>}
        <div className="dashboard-charts">
            <Donut title="Composição das despesas pagas" values={[...categories].sort((a, b) => b[1] - a[1])} />
            {serviceValues ? <Donut title="Recebimento dos serviços do mês" values={serviceValues} /> :
                <section className="dashboard-panel"><h3>Recebimento dos serviços do mês</h3>
                    <p role="status">{servicesError ? 'Não foi possível carregar os serviços.' : 'Carregando serviços…'}</p>
                </section>}
        </div>
    </div>;
}

function Evolution({ months, values }: { months: string[]; values: MonthSummary[] }) {
    const latest = months.length - 1;
    const [selected, setSelected] = useState(latest);
    const all = values.flatMap(value => metrics.map(metric => value[metric.key]));
    const min = Math.min(0, ...all);
    const max = Math.max(min + 100, ...all);
    const x = (index: number) => 30 + index * 540 / latest;
    const y = (value: number) => 18 + (max - value) / (max - min) * 144;
    return <section className="dashboard-panel evolution">
        <h3>Evolução mensal</h3>
        <dl className="monthly-deltas">{metrics.map(metric => {
            const difference = values[latest][metric.key] - values[latest - 1][metric.key];
            return <div key={metric.key}><dt>{metric.label} vs. {label(months[latest - 1])}</dt>
                <dd>{difference === 0 ? 'Sem variação' : (difference > 0 ? '+' : '') + money.format(difference / 100)}</dd></div>;
        })}</dl>
        <div className="evolution-chart">
            <div className="chart-axis" aria-hidden="true"><span>{money.format(max / 100)}</span><span>{money.format(min / 100)}</span></div>
            <svg viewBox="0 0 600 180" aria-hidden="true">
                <line x1="0" x2="600" y1={y(0)} y2={y(0)} stroke="#7c8ea0" />
                <line x1={x(selected)} x2={x(selected)} y1="12" y2="168" stroke="#7c8ea0" strokeDasharray="4 4" />
                {metrics.map(metric => <g key={metric.key} fill={metric.color}>
                    <polyline points={values.map((value, index) => `${x(index)},${y(value[metric.key])}`).join(' ')}
                        fill="none" stroke={metric.color} strokeWidth="3" />
                    {values.map((value, index) => <circle key={months[index]} cx={x(index)} cy={y(value[metric.key])}
                        r={index === selected ? 7 : 5} stroke="white" strokeWidth="2" />)}
                </g>)}
            </svg>
        </div>
        <label className="evolution-month">Mês em destaque
            <select value={selected} onChange={event => setSelected(Number(event.target.value))}>
                {months.map((month, index) => <option key={month} value={index}>{label(month)}</option>)}
            </select>
        </label>
        <dl className="monthly-deltas" aria-live="polite">{metrics.map(metric =>
            <div key={metric.key}><dt><span className="series-key" aria-hidden="true" style={{ background: metric.color }} />{metric.label}</dt>
                <dd>{money.format(values[selected][metric.key] / 100)}</dd></div>)}</dl>
        <details><summary>Ver valores dos seis meses</summary>
            <table className="chart-table"><caption>Comparação mensal em reais</caption>
                <thead><tr><th scope="col">Mês</th>{metrics.map(metric => <th key={metric.key} scope="col">{metric.label}</th>)}</tr></thead>
                <tbody>{values.map((value, index) => <tr key={months[index]}><th scope="row">{label(months[index])}</th>
                    {metrics.map(metric => <td key={metric.key}>{money.format(value[metric.key] / 100)}</td>)}</tr>)}</tbody>
            </table>
        </details>
    </section>;
}
