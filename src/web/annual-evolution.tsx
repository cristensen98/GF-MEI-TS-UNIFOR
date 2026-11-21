import { useState } from 'react';
import type { Entry } from '../domain/model.ts';
import { recordedRevenue } from '../domain/mei-revenue.ts';
import { formatMoney } from './client.ts';
import type { MonthSummary } from './summary.tsx';

const metrics = [
    { key: 'entradas', label: 'Entradas', color: '#087565' },
    { key: 'saidas', label: 'Despesas pagas', color: '#6746a4' },
    { key: 'resultado', label: 'Resultado de caixa', color: '#193c64' }
] as const;
const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const label = (month: string) => monthName.format(new Date(month + '-01T00:00:00Z'));

type Revenue = ReturnType<typeof recordedRevenue>;
type Series = { label: string; color: string; values: number[] };

function EvolutionChart({ months, selected, series, revenue }: {
    months: string[]; selected: number; series: Series[]; revenue: Revenue | null;
}) {
    const ceiling = { label: 'Teto do MEI', color: '#895514', dash: '6 4' };
    const boundary = { label: 'Teto + 20%', color: '#991b1b', dash: '2 4' };
    const guides = revenue?.some(point => point.thresholds) ? [ceiling, boundary] : [];
    const data = series.flatMap(item => item.values);
    const min = Math.min(0, ...data);
    const max = Math.max(min + 100, ...data, ...(revenue?.map(point => point.thresholds?.excessBoundary ?? 0) ?? []));
    const step = 600 / months.length;
    const x = (index: number) => 18 + step * (index + .5);
    const y = (value: number) => 12 + (max - value) / (max - min) * 143;

    return <>
        <div className="annual-legend" aria-hidden="true">
            {series.map(item => <span key={item.label}><i style={{ color: item.color }} />{item.label}</span>)}
            {guides.map(guide => <span key={guide.label}><i className={guide === boundary ? 'chart-guide-dotted' : 'chart-guide'}
                style={{ color: guide.color }} />{guide.label}</span>)}
        </div>
        <div className="evolution-chart" aria-hidden="true">
            <div className="chart-axis"><span>{formatMoney(max)}</span><span>{formatMoney(min)}</span></div>
            <div className="annual-plot">
                <svg viewBox="0 0 636 185">
                    <line x1="18" x2="618" y1={y(0)} y2={y(0)} stroke="#7c8ea0" />
                    {revenue?.map(({ thresholds }, index) => thresholds && <g key={months[index]}>
                        <path d={`M${x(index) - step / 2} ${y(thresholds.ceiling)}h${step}`} stroke={ceiling.color} strokeDasharray={ceiling.dash} />
                        <path d={`M${x(index) - step / 2} ${y(thresholds.excessBoundary)}h${step}`} stroke={boundary.color} strokeDasharray={boundary.dash} />
                    </g>)}
                    <line x1={x(selected)} x2={x(selected)} y1="8" y2="158" stroke="#7c8ea0" strokeDasharray="4 4" />
                    {series.map(item => <g key={item.label} fill={item.color}>
                        <path d={item.values.map((value, index) => {
                            const reset = revenue && revenue[index].year !== revenue[index - 1]?.year;
                            return `${index === 0 || reset ? 'M' : 'L'}${x(index)} ${y(value)}`;
                        }).join(' ')} fill="none" stroke={item.color} strokeWidth="2.5" />
                        {item.values.map((value, index) => <circle key={months[index]} cx={x(index)} cy={y(value)}
                            r={index === selected ? 6 : 4} stroke="white" strokeWidth="1.5" />)}
                    </g>)}
                    {months.map((month, index) => <text key={month} x={x(index)} y="177" textAnchor="middle"
                        fill="currentColor" fontSize="11">{month.slice(5)}/{month.slice(2, 4)}</text>)}
                </svg>
            </div>
        </div>
    </>;
}

export function AnnualEvolution({ months, referenceIndex, cash, services, cashError, revenueError }: {
    referenceIndex: number;
    months: string[]; cash: MonthSummary[] | null; services: Entry[] | null;
    cashError: boolean; revenueError: boolean;
}) {
    const [selected, setSelected] = useState(referenceIndex);
    const [fiscal, setFiscal] = useState(true);
    const revenue = services && recordedRevenue(months, services);
    const selectedRevenue = revenue?.[selected];
    const activeRevenue = fiscal ? revenue : null;
    const series = fiscal
        ? revenue && [{ label: 'Faturamento acumulado no ano', color: '#087565', values: revenue.map(point => point.total) }]
        : cash && metrics.map(metric => ({ ...metric, values: cash.map(value => value[metric.key]) }));
    const loadError = fiscal ? revenueError : cashError;

    return <section className="dashboard-panel evolution" aria-labelledby="annual-evolution-title">
        <h3 id="annual-evolution-title">Evolução anual</h3>
        <p className="muted">Janeiro a dezembro de {months[0].slice(0, 4)}</p>
        <div className="annual-controls">
            <div className="actions" role="group" aria-label="Dados do gráfico">
                <button type="button" aria-pressed={fiscal} onClick={() => setFiscal(true)}>Faturamento e limite MEI</button>
                <button type="button" aria-pressed={!fiscal} onClick={() => setFiscal(false)}>Fluxo de caixa</button>
            </div>
            <label className="evolution-month">Mês em destaque
                <select value={selected} onChange={event => setSelected(Number(event.target.value))}>
                    {months.map((month, index) => <option key={month} value={index}>{label(month)}</option>)}
                </select>
            </label>
        </div>
        {series ? <>
            {fiscal && selectedRevenue && <div className="revenue-alert" aria-live="polite">
                <strong>{selectedRevenue.year} · {formatMoney(selectedRevenue.total)} acumulados</strong>
                {selectedRevenue.band && <span className="entry-status" data-tone={selectedRevenue.band.tone}>
                    {selectedRevenue.band.label}
                </span>}
                {selectedRevenue.thresholds && <p className="muted">
                    {selectedRevenue.thresholds.projected ? 'Faixas previstas para o ano completo' : 'Faixas do ano completo'} · Teto de {formatMoney(selectedRevenue.thresholds.ceiling)}
                    {' · Teto + 20% de '}{formatMoney(selectedRevenue.thresholds.excessBoundary)}
                </p>}
                {selectedRevenue.thresholds?.projected && <p className="muted">Ampliação sujeita à condição orçamentária da LC 238/2026.</p>}
                {!selectedRevenue.thresholds && <p className="muted">Faixas de referência disponíveis a partir de 2018.</p>}
                <p className="muted">Estimativa pelos serviços cadastrados, na data do serviço. O acumulado reinicia em janeiro. No ano de abertura, o teto é proporcional aos meses de atividade.</p>
            </div>}
            <EvolutionChart months={months} selected={selected} series={series} revenue={activeRevenue} />
            {!fiscal && <dl className="monthly-deltas" aria-live="polite">{series.map(item =>
                <div key={item.label}><dt>{item.label}</dt><dd>{formatMoney(item.values[selected])}</dd></div>)}</dl>}
            <details><summary>Ver valores dos {months.length} meses</summary>
                <div className="table-scroll" role="region" aria-label="Valores da evolução anual" tabIndex={0}>
                    <table className="chart-table annual-values-table">
                        <caption>{fiscal ? 'Faturamento registrado e faixa de referência' : 'Fluxo de caixa mensal'}</caption>
                        <thead><tr><th scope="col">Mês</th>{fiscal
                            ? <><th scope="col">No mês</th><th scope="col">Acumulado no ano</th><th scope="col">Faixa de referência</th></>
                            : series.map(item => <th key={item.label} scope="col">{item.label}</th>)}</tr></thead>
                        <tbody>{months.map((month, index) => <tr key={month}><th scope="row">{label(month)}</th>
                            {activeRevenue
                                ? <><td>{formatMoney(activeRevenue[index].monthly)}</td><td>{formatMoney(activeRevenue[index].total)}</td>
                                    <td>{activeRevenue[index].band?.label ?? '—'}</td></>
                                : series.map(item => <td key={item.label}>{formatMoney(item.values[index])}</td>)}
                        </tr>)}</tbody>
                    </table>
                </div>
            </details>
        </> : <p role={loadError ? 'alert' : 'status'}>
            {loadError ? 'Não foi possível carregar os dados do gráfico.' : 'Carregando dados do gráfico…'}
        </p>}
        {fiscal && <details><summary>Entender os alertas do MEI</summary>
            <dl className="revenue-rules">
                <dt>Dentro do teto</dt><dd>O faturamento registrado está dentro da faixa de referência.</dd>
                <dt>Excesso de até 20%</dt><dd>O desenquadramento por faturamento produz efeitos no ano seguinte. A diferença sobre o excesso é apurada na DASN-SIMEI.</dd>
                <dt>Excesso acima de 20%</dt><dd>O desenquadramento por faturamento produz efeitos retroativos a janeiro, ou ao início da atividade no ano de abertura. A apuração passa a seguir as regras aplicáveis do Simples Nacional.</dd>
            </dl>
            <p>Quando houver excesso, o prazo de comunicação é o último dia útil do mês seguinte ao da ocorrência. Consulte a <a href="https://legis.senado.gov.br/norma/572878/publicacao/34621013">LC 123/2006, art. 18-A</a> e a <a href="https://legis.senado.gov.br/norma/44276013/publicacao/44280206">LC 238/2026</a>.</p>
        </details>}
    </section>;
}
