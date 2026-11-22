import { useEffect, useId, useState } from 'react';
import type { Entry } from '../domain/model.ts';
import { recordedRevenue } from '../domain/mei-revenue.ts';
import { formatMoney, request } from './client.ts';
import type { MonthSummary } from './summary.tsx';

const metrics = [
    { key: 'entradas', label: 'Entradas', color: 'var(--cash-in)' },
    { key: 'saidas', label: 'Despesas pagas', color: 'var(--cash-out)' },
    { key: 'resultado', label: 'Resultado de caixa', color: 'var(--primary)' }
] as const;
const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const label = (month: string) => monthName.format(new Date(month + '-01T00:00:00Z'));

type Revenue = ReturnType<typeof recordedRevenue>;
type Series = { label: string; color: string; values: (number | bigint)[] };

const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const compactAxis = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const axisLabel = (cents: bigint) => Math.abs(Number(cents)) >= 100_000
    ? `R$ ${compactAxis.format(Number(cents) / 100)}`
    : formatMoney(cents);

function axisTicks(low: bigint, high: bigint) {
    const interval = (high - low + 3n) / 4n;
    const magnitude = 10n ** BigInt(interval.toString().length - 1);
    const step = [1n, 2n, 5n, 10n].map(factor => factor * magnitude).find(value => value >= interval)!;
    const first = (low - step + 1n) / step * step;
    const last = (high + step - 1n) / step * step;
    return Array.from({ length: Number((last - first) / step) + 1 }, (_, index) => first + BigInt(index) * step);
}

function EvolutionChart({ months, selected, series, revenue, referenceOnly, onSelect }: {
    months: string[]; selected: number; series: Series[]; revenue: Revenue | null;
    referenceOnly: boolean;
    onSelect: (index: number) => void;
}) {
    const gradientId = useId();
    const ceiling = { label: referenceOnly ? 'Teto anual de referência' : 'Teto do MEI', color: 'var(--chart-limit)', dash: '6 4' };
    const boundary = { label: referenceOnly ? 'Referência anual + 20%' : 'Teto + 20%', color: 'var(--chart-excess)', dash: '2 4' };
    const guides = revenue?.some(point => point.thresholds) ? [ceiling, boundary] : [];
    const data = series.flatMap(item => item.values.map(value => BigInt(value)));
    const limits = revenue?.map(point => BigInt(point.thresholds?.excessBoundary ?? 0)) ?? [];
    const min = data.reduce((lowest, value) => value < lowest ? value : lowest, 0n);
    const max = [...data, ...limits].reduce((highest, value) => value > highest ? value : highest,
        min < -100n ? 0n : min + 100n);
    const ticks = axisTicks(min, max);
    const axisMin = ticks[0];
    const axisMax = ticks[ticks.length - 1];
    const left = 98;
    const right = 736;
    const top = 22;
    const bottom = 242;
    const step = (right - left) / months.length;
    const x = (index: number) => left + step * (index + .5);
    const y = (value: number | bigint) =>
        top + Number(axisMax - BigInt(value)) / Number(axisMax - axisMin) * (bottom - top);
    const paths = series.map(item => item.values.map((value, index) =>
        `${index === 0 ? 'M' : 'L'}${x(index)} ${y(value)}`).join(' '));

    return <div className="annual-chart-card">
        <div className="annual-legend">
            {[...series, ...guides].map(item =>
                <span key={item.label}><svg aria-hidden="true" width="23" height="10" viewBox="0 0 23 10">
                    <line x1="0" x2="23" y1="5" y2="5" stroke={item.color} strokeWidth="2.5"
                        strokeDasharray={'dash' in item ? item.dash : undefined} />
                </svg>{item.label}</span>)}
        </div>
        <div className="annual-plot">
            <svg viewBox="0 0 752 282" role="group" aria-label="Gráfico de evolução anual. Selecione um mês para destacá-lo.">
                <defs><linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop stopColor={series[0].color} stopOpacity=".18" />
                    <stop offset="1" stopColor={series[0].color} stopOpacity=".025" />
                </linearGradient></defs>
                <g aria-hidden="true">
                    {ticks.map(tick => <g key={String(tick)}>
                        <line className={tick === 0n ? 'annual-zero' : 'annual-grid'} x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
                        <text x={left - 12} y={y(tick)} dominantBaseline="middle" textAnchor="end">{axisLabel(tick)}</text>
                    </g>)}
                    {revenue && <path className="annual-area"
                        d={`${paths[0]} L${x(months.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`}
                        fill={`url(#${gradientId})`} />}
                    {revenue?.map(({ thresholds }, index) => thresholds && <g key={months[index]}>
                        <path d={`M${x(index) - step / 2} ${y(thresholds.ceiling)}h${step}`} stroke={ceiling.color} strokeDasharray={ceiling.dash} />
                        <path d={`M${x(index) - step / 2} ${y(thresholds.excessBoundary)}h${step}`} stroke={boundary.color} strokeDasharray={boundary.dash} />
                    </g>)}
                    {series.map((item, index) => <path className="annual-series-line" key={item.label}
                        d={paths[index]} fill="none" stroke={item.color} />)}
                </g>
                {months.map((month, index) => {
                    const description = [label(month), ...series.map(item =>
                        `${item.label}: ${formatMoney(item.values[index])}`)].join('. ');
                    return <g key={month} className="annual-point-selector" role="button" tabIndex={0}
                        aria-pressed={index === selected} aria-label={description} onClick={() => onSelect(index)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelect(index);
                            }
                        }}>
                        <title>{description}</title>
                        <rect className="annual-month-band" x={x(index) - step / 2 + 2} y={top - 9}
                            width={step - 4} height={bottom - top + 45} rx="7" />
                        <line className="annual-month-guide" x1={x(index)} x2={x(index)} y1={top} y2={bottom}
                            strokeDasharray="4 4" />
                        {series.map(item => <circle className="annual-marker" key={item.label}
                            cx={x(index)} cy={y(item.values[index])} r={index === selected ? 6 : 4}
                            fill={item.color} />)}
                        <text className="annual-month-label" x={x(index)} y="269" textAnchor="middle">
                            {monthShort.format(new Date(month + '-01T00:00:00Z')).replace(/\.$/, '')}
                        </text>
                    </g>;
                })}
            </svg>
        </div>
    </div>;
}

function monthsOfYear(year: string) {
    return Array.from({ length: 12 }, (_, index) => year + '-' + String(index + 1).padStart(2, '0'));
}

export function AnnualEvolution({ month, openingMonth }: { month: string; openingMonth?: string }) {
    const year = month.slice(0, 4);
    const months = monthsOfYear(year);
    const [selected, setSelected] = useState(Number(month.slice(5)) - 1);
    const [fiscal, setFiscal] = useState(true);
    const [cash, setCash] = useState<MonthSummary[] | null>(null);
    const [services, setServices] = useState<Entry[] | null>(null);
    const [cashError, setCashError] = useState(false);
    const [revenueError, setRevenueError] = useState(false);

    useEffect(() => {
        let active = true;
        void request<Entry[]>('servicos').then(result => { if (active) setServices(result); })
            .catch(() => { if (active) setRevenueError(true); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (fiscal || cash) return;
        let active = true;
        setCashError(false);
        void Promise.all(monthsOfYear(year).map(item => request<MonthSummary>('resumo/' + item)))
            .then(result => { if (active) setCash(result); })
            .catch(() => { if (active) setCashError(true); });
        return () => { active = false; };
    }, [cash, fiscal, year]);

    const revenue = services && recordedRevenue(months, services, openingMonth);
    const referenceOnly = !openingMonth;
    const wholeYear = selected === -1;
    const selectedMonth = months[wholeYear ? months.length - 1 : selected];
    const selectedRevenue = revenue?.[wholeYear ? revenue.length - 1 : selected];
    const beforeOpening = Boolean(openingMonth && selectedMonth < openingMonth);
    const thresholds = selectedRevenue?.thresholds;
    const room = selectedRevenue && thresholds ? BigInt(thresholds.ceiling) - selectedRevenue.total : null;
    const ceilingLabel = thresholds?.proportional ? 'Teto proporcional' : referenceOnly
        ? 'Teto anual de referência' : 'Teto do ano completo';
    const activeRevenue = fiscal ? revenue : null;
    const series = fiscal
        ? revenue && [{ label: 'Faturamento acumulado no ano', color: 'var(--income)', values: revenue.map(point => point.total) }]
        : cash && metrics.map(metric => ({ ...metric, values: cash.map(value => value[metric.key]) }));
    const selectedCash = !fiscal && series
        ? series.map(item => ({ ...item, selectedValue: wholeYear
            ? item.values.reduce<bigint>((sum, value) => sum + BigInt(value), 0n)
            : item.values[selected] }))
        : [];
    const loadError = fiscal ? revenueError : cashError;

    return <section className="dashboard-panel evolution" aria-labelledby="annual-evolution-title">
        <h3 id="annual-evolution-title">Janeiro a dezembro de {year}</h3>
        <div className="annual-controls">
            <div className="actions" role="group" aria-label="Dados do gráfico">
                <button type="button" aria-pressed={fiscal} onClick={() => setFiscal(true)}>Faturamento e limite MEI</button>
                <button type="button" aria-pressed={!fiscal} onClick={() => setFiscal(false)}>Fluxo de caixa</button>
            </div>
            <label className="evolution-month">Mês em destaque
                <select value={selected} onChange={event => setSelected(Number(event.target.value))}>
                    <option value={-1}>Anual de {year}</option>
                    {months.map((month, index) => <option key={month} value={index}>{label(month)}</option>)}
                </select>
            </label>
        </div>
        {series ? <>
            {fiscal && selectedRevenue && <div className="annual-metrics" aria-live="polite">
                <dl className="monthly-deltas">
                    <div><dt>{wholeYear ? `Faturamento em ${year}` : `Faturamento até ${label(months[selected])}`}</dt>
                        <dd>{formatMoney(selectedRevenue.total)}</dd></div>
                    {thresholds && <div><dt>{ceilingLabel}{thresholds.projected ? ' (previsto)' : ''}</dt>
                        <dd>{formatMoney(thresholds.ceiling)}</dd></div>}
                    {room !== null && <div><dt>{room < 0 ? 'Excedente sobre o teto' : 'Margem até o teto'}{referenceOnly ? ' de referência' : ''}</dt>
                        <dd>{formatMoney(room < 0n ? -room : room)}</dd></div>}
                </dl>
                <div className="revenue-alert">
                {selectedRevenue.band && (referenceOnly
                    ? <span className="entry-status">Apenas referência anual: {selectedRevenue.band.label}</span>
                    : <span className="entry-status" data-tone={selectedRevenue.band.tone}>{selectedRevenue.band.label}</span>)}
                {thresholds && <p className="muted">
                    {ceilingLabel}{thresholds.projected ? ' (previsto)' : ''}: {formatMoney(thresholds.ceiling)}
                    {' · Teto + 20%: '}{formatMoney(thresholds.excessBoundary)}
                </p>}
                {referenceOnly && thresholds && <p className="muted">
                    Informe o mês de abertura em Editar perfil para calcular o teto do primeiro ano.
                </p>}
                {thresholds?.projected && <p className="muted">Ampliação sujeita à condição orçamentária da LC 238/2026.</p>}
                {!thresholds && <p className="muted">{beforeOpening
                    ? 'Não há faixa aplicável antes do mês de abertura.'
                    : 'Faixas de referência disponíveis a partir de 2018.'}</p>}
                <p className="muted">Estimativa pelos serviços cadastrados, na data do serviço. O acumulado reinicia em janeiro. No ano de abertura, o teto é proporcional aos meses de atividade.</p>
                </div>
            </div>}
            {!fiscal && <dl className="monthly-deltas annual-metrics" aria-live="polite">{selectedCash.map(item =>
                <div key={item.label}><dt>{item.label}{wholeYear ? ` em ${year}` : ''}</dt>
                    <dd>{formatMoney(item.selectedValue)}</dd></div>)}</dl>}
            <EvolutionChart months={months} selected={selected} series={series} revenue={activeRevenue}
                referenceOnly={referenceOnly} onSelect={setSelected} />
            <section className="annual-information" aria-labelledby="annual-values-heading">
                <h4 id="annual-values-heading">Valores dos {months.length} meses</h4>
                <div className="table-scroll" role="region" aria-label="Valores da evolução anual" tabIndex={0}>
                    <table className="chart-table annual-values-table">
                        <caption>{fiscal ? 'Faturamento registrado e faixa de referência' : 'Fluxo de caixa mensal'}</caption>
                        <thead><tr><th scope="col">Mês</th>{fiscal
                            ? <><th scope="col">No mês</th><th scope="col">Acumulado no ano</th><th scope="col">{referenceOnly ? 'Comparação com o teto anual de referência' : 'Faixa de referência'}</th></>
                            : series.map(item => <th key={item.label} scope="col">{item.label}</th>)}</tr></thead>
                        <tbody>{months.map((month, index) => <tr key={month}><th scope="row">{label(month)}</th>
                            {activeRevenue
                                ? <><td>{formatMoney(activeRevenue[index].monthly)}</td><td>{formatMoney(activeRevenue[index].total)}</td>
                                    <td>{activeRevenue[index].band?.label ?? '—'}</td></>
                                : series.map(item => <td key={item.label}>{formatMoney(item.values[index])}</td>)}
                        </tr>)}</tbody>
                    </table>
                </div>
            </section>
        </> : <p role={loadError ? 'alert' : 'status'}>
            {loadError ? 'Não foi possível carregar os dados do gráfico.' : 'Carregando dados do gráfico…'}
        </p>}
        {fiscal && <section className="annual-information" aria-labelledby="annual-alerts-heading">
            <h4 id="annual-alerts-heading">Entender os alertas do MEI</h4>
            <dl className="revenue-rules">
                <dt>Dentro do teto</dt><dd>O faturamento registrado está dentro da faixa de referência.</dd>
                <dt>Excesso de até 20%</dt><dd>O desenquadramento por faturamento produz efeitos no ano seguinte. A diferença sobre o excesso é apurada na DASN-SIMEI.</dd>
                <dt>Excesso acima de 20%</dt><dd>O desenquadramento por faturamento produz efeitos retroativos a janeiro, ou ao início da atividade no ano de abertura. A apuração passa a seguir as regras aplicáveis do Simples Nacional.</dd>
            </dl>
            <p>Quando houver excesso, o prazo de comunicação é o último dia útil do mês seguinte ao da ocorrência. Consulte a <a href="https://legis.senado.gov.br/norma/572878/publicacao/34621013">LC 123/2006, art. 18-A</a> e a <a href="https://legis.senado.gov.br/norma/44276013/publicacao/44280206">LC 238/2026</a>.</p>
        </section>}
    </section>;
}
