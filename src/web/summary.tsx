import { useState } from 'react';
import type { Entry } from '../domain/model.ts';
import { formatMoney } from './client.ts';
import { Modal } from './modal.tsx';
import { DataTable } from './data-table.tsx';
import { StatusBadge } from './status-badge.tsx';
import { MonthlyInsights } from './monthly-insights.tsx';

export interface MonthSummary {
    entradas: number;
    saidas: number;
    resultado: number;
    recebimentos: Entry[];
    despesas: Entry[];
}

export interface ServiceSummary {
    recebido: number;
    saldo: number;
    custoDireto: number;
    diferenca: number;
    situacao: string;
}

function Amounts({ values }: { values: [string, number, boolean?][] }) {
    return <dl className="amounts">{values.map(([label, value, primary]) =>
        <div key={label} className={primary ? 'amount-primary' : undefined}>
            <dt>{label}</dt><dd>{formatMoney(value)}</dd>
        </div>)}</dl>;
}

export function dateLabel(date: string) {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
}

function CashCharts({ summary, month }: { summary: MonthSummary; month: string }) {
    const endOfMonth = new Date(`${month}-01T00:00:00Z`);
    endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
    const lastDay = endOfMonth.getUTCDate();
    const periods = Array.from({ length: Math.ceil(lastDay / 7) }, (_, index) => ({
        label: `${index * 7 + 1}–${Math.min((index + 1) * 7, lastDay)}`, income: 0, expenses: 0
    }));
    for (const entry of summary.recebimentos) {
        periods[Math.floor((Number(entry.data.slice(-2)) - 1) / 7)].income += entry.valor;
    }
    const categories = new Map<string, number>();
    for (const entry of summary.despesas) {
        if (!entry.pagamento) continue;
        periods[Math.floor((Number(entry.pagamento.slice(-2)) - 1) / 7)].expenses += entry.valor;
        const category = entry.detalhe || 'Sem categoria';
        categories.set(category, (categories.get(category) ?? 0) + entry.valor);
    }
    const scale = Math.max(1, ...periods.flatMap(period => [period.income, period.expenses]));
    const sorted = [...categories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
    return <div className="dashboard-charts">
        <section className="dashboard-panel" aria-labelledby="cash-heading">
            <h3 id="cash-heading">Fluxo de caixa</h3>
            <p className="muted">Entradas e despesas pagas por período</p>
            {summary.entradas || summary.saidas ? <>
                <div className="chart-legend" aria-hidden="true"><span>Entradas à esquerda</span><span>Despesas pagas à direita</span></div>
                <div className="cash-chart" aria-hidden="true">
                    <div className="chart-scale">
                        <span>{formatMoney(scale)}</span><span>{formatMoney(0)}</span>
                    </div>
                    {periods.map(period => <div key={period.label}>
                        <div className="bar-group">
                            <span style={{ height: `${period.income / scale * 100}%` }} />
                            <span style={{ height: `${period.expenses / scale * 100}%` }} />
                        </div>
                        <span>{period.label}</span>
                    </div>)}
                </div>
                <details><summary>Ver valores por período</summary>
                    <table className="chart-table">
                        <caption>Fluxo de caixa por dias do mês</caption>
                        <thead><tr><th scope="col">Dias</th><th scope="col">Entradas</th><th scope="col">Despesas</th></tr></thead>
                        <tbody>{periods.map(period => <tr key={period.label}>
                            <th scope="row">{period.label}</th><td>{formatMoney(period.income)}</td>
                            <td>{formatMoney(period.expenses)}</td>
                        </tr>)}</tbody>
                    </table>
                </details>
            </> : <p className="chart-empty">Nenhuma movimentação de caixa neste mês.</p>}
        </section>
        <section className="dashboard-panel" aria-labelledby="categories-heading">
            <h3 id="categories-heading">Despesas por categoria</h3>
            <p className="muted">Participação no total pago</p>
            {sorted.length ? <ul className="category-chart" role="list">{sorted.map(([category, value]) => {
                const share = value / summary.saidas;
                return <li key={category}>
                    <div><strong>{category}</strong><span>{formatMoney(value)}</span></div>
                    <div><span className="category-track" aria-hidden="true"><span style={{ width: `${share * 100}%` }} /></span>
                        <span>{new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(share)}</span></div>
                </li>;
            })}</ul> : <p className="chart-empty">Nenhuma despesa paga neste mês.</p>}
        </section>
    </div>;
}

function Transactions({ entries, empty }: { entries: Entry[]; empty: string }) {
    return entries.length === 0 ? <p className="empty">{empty}</p> :
            <DataTable label="Lançamentos de caixa" columns={['Descrição', 'Tipo', 'Data', 'Valor']}>{entries.map(entry => {
                const date = entry.pagamento ?? entry.data;
                return <tr key={entry.id}>
                    <th scope="row">{entry.descricao}</th>
                    <td>{entry.pagamento ? 'Saída' : 'Entrada'}</td>
                    <td><time dateTime={date}>{dateLabel(date)}</time></td>
                    <td className="table-number">{entry.pagamento ? '−' : '+'}{formatMoney(entry.valor)}</td>
                </tr>;
            })}</DataTable>;
}

export function MonthlyReport({ summary, month }: { summary: MonthSummary; month: string }) {
    const [selection, setSelection] = useState<{ key: 'resultado' | 'entradas' | 'saidas'; trigger: HTMLButtonElement } | null>(null);
    const entries = [...summary.recebimentos, ...summary.despesas].sort((first, second) =>
        (second.pagamento ?? second.data).localeCompare(first.pagamento ?? first.data) || second.id - first.id);
    const indicators = {
        resultado: { label: 'Resultado de caixa', entries, empty: 'Nenhum lançamento neste mês.' },
        entradas: { label: 'Entradas', entries: entries.filter(entry => !entry.pagamento), empty: 'Nenhum recebimento neste mês.' },
        saidas: { label: 'Despesas pagas', entries: entries.filter(entry => entry.pagamento), empty: 'Nenhuma despesa paga neste mês.' }
    };
    const indicator = selection && indicators[selection.key];
    return <>
        <div className="amounts dashboard-indicators">
            {(['resultado', 'entradas', 'saidas'] as const).map(key =>
                <button key={key} type="button" className={key === 'resultado' ? 'amount-primary' : undefined}
                    aria-haspopup="dialog" onClick={event => setSelection({ key, trigger: event.currentTarget })}>
                    <span>{indicators[key].label}</span>
                    <strong>{formatMoney(summary[key])}</strong>
                    <span className="indicator-action">Ver detalhes <span aria-hidden="true">↗</span></span>
                </button>)}
        </div>
        <MonthlyInsights key={month} month={month} summary={summary} />
        <CashCharts summary={summary} month={month} />
        <section className="dashboard-panel" aria-labelledby="transactions-heading">
            <h3 id="transactions-heading">Lançamentos do mês</h3>
            <Transactions entries={entries} empty="Nenhum lançamento neste mês." />
        </section>
        {selection && indicator && <Modal title={indicator.label} trigger={selection.trigger} close={() => setSelection(null)}>
            <p className="muted">Referência: {month.slice(5)}/{month.slice(0, 4)}</p>
            <p className="modal-total">{formatMoney(summary[selection.key])}</p>
            {selection.key === 'resultado' && <Amounts values={[[ 'Entradas', summary.entradas], ['Despesas pagas', summary.saidas]]} />}
            <h3>Lançamentos considerados</h3>
            <Transactions entries={indicator.entries} empty={indicator.empty} />
        </Modal>}
    </>;
}

export function ServiceReport({ summary }: { summary: ServiceSummary }) {
    return <div className="service-report">
        <p>Situação <StatusBadge status={summary.situacao} /></p>
        <Amounts values={[['Saldo a receber', summary.saldo, true], ['Recebido', summary.recebido],
            ['Custo direto', summary.custoDireto], ['Diferença após custos diretos', summary.diferenca]]} />
    </div>;
}

