import { useEffect, useState } from 'react';
import type { Entry } from '../domain/model.ts';
import { serviceTotal } from '../domain/model.ts';
import { formatMoney, request } from './client.ts';
import type { MonthSummary } from './summary.tsx';

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const categoryPalette = [
    'var(--overview-category-blue, var(--income))',
    'var(--overview-category-cyan, var(--expenses))',
    'var(--overview-category-gold, var(--cash-result))',
    'var(--overview-category-pink, var(--chart-cyan))',
    'var(--overview-category-slate, var(--chart-magenta))'
];
const receiptPalette = ['var(--overview-income, var(--income))', 'var(--overview-pending, var(--expenses))'];

type ChartValues = [string, number | bigint][];

function Donut({ title, values, palette, empty }: {
    title: string; values: ChartValues; palette: string[]; empty: string;
}) {
    const total = values.reduce((sum, [, value]) => sum + BigInt(value), 0n);
    const share = (value: number | bigint) => Number(value) / Number(total);
    let position = 0;
    const stops = values.map(([, value], index) => {
        const start = position;
        position += share(value) * 100;
        return `${palette[index % palette.length]} ${start}% ${position}%`;
    });
    return <section className="dashboard-panel">
        <h3>{title}</h3>
        {total > 0n ? <div className="donut-content">
            <div className="donut" aria-hidden="true" style={{ background: 'conic-gradient(' + stops.join(',') + ')' }}>
                <strong>{formatMoney(total)}</strong>
            </div>
            <p className="sr-only">Total: {formatMoney(total)}</p>
            <ul role="list">{values.map(([name, value], index) => <li key={name}>
                <span className="series-key" aria-hidden="true" style={{ background: palette[index % palette.length] }} />
                <span>{name}</span><strong>{formatMoney(value)} · {percent.format(share(value))}</strong>
            </li>)}</ul>
        </div> : <p className="chart-empty">{empty}</p>}
    </section>;
}

export function MonthlyInsights({ month, summary }: { month: string; summary: MonthSummary }) {
    const [serviceValues, setServiceValues] = useState<ChartValues | null>(null);
    const [servicesError, setServicesError] = useState(false);

    useEffect(() => {
        let active = true;
        void Promise.all([request<Entry[]>('servicos'), request<Entry[]>('recebimentos')])
            .then(([services, receipts]) => {
                if (!active) return;
                const selected = services.filter(entry => !entry.cancelado && entry.data.startsWith(month + '-'));
                const ids = new Set(selected.map(entry => entry.id));
                const contracted = selected.reduce((sum, entry) => sum + BigInt(serviceTotal(entry)), 0n);
                const paid = receipts.reduce((sum, entry) => !entry.cancelado && entry.servico !== null &&
                    ids.has(entry.servico) && entry.data.slice(0, 7) <= (month.length === 4 ? month + '-12' : month)
                    ? sum + BigInt(entry.valor) : sum, 0n);
                const period = month.length === 4 ? 'ano' : 'mês';
                setServiceValues([['Recebido até o fim do ' + period, paid], ['Em aberto no fim do ' + period, contracted - paid]]);
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
        <div className="dashboard-charts">
            <Donut title="Composição das despesas pagas" palette={categoryPalette}
                empty="Cadastre despesas e informe a data do pagamento no período selecionado para visualizar sua composição."
                values={[...categories].sort((a, b) => b[1] - a[1])} />
            {serviceValues ? <Donut title={'Recebimento dos serviços do ' + (month.length === 4 ? 'ano' : 'mês')}
                palette={receiptPalette} values={serviceValues}
                empty="Cadastre serviços com data no período selecionado para acompanhar os valores recebidos e em aberto." /> :
                <section className="dashboard-panel"><h3>Recebimento dos serviços do período</h3>
                    <p role="status">{servicesError ? 'Não foi possível carregar os serviços.' : 'Carregando serviços…'}</p>
                </section>}
        </div>
    </div>;
}
