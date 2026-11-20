import { useId } from 'react';
import type { Entry } from '../domain/model.ts';
import { money } from './client.ts';

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
            <dt>{label}</dt><dd>{money.format(value / 100)}</dd>
        </div>)}</dl>;
}

export function dateLabel(date: string) {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
}

export function MonthlyReport({ summary }: { summary: MonthSummary }) {
    const entries = [...summary.recebimentos, ...summary.despesas].sort((first, second) =>
        (second.pagamento ?? second.data).localeCompare(first.pagamento ?? first.data) || second.id - first.id);
    return <>
        <Amounts values={[['Resultado de caixa', summary.resultado, true], ['Entradas', summary.entradas], ['Despesas pagas', summary.saidas]]} />
        <h3>Lançamentos do mês</h3>
        {entries.length === 0 ? <p className="empty">Nenhum lançamento neste mês.</p> :
            <ul className="entries" role="list">{entries.map(entry => {
                const date = entry.pagamento ?? entry.data;
                return <li className="transaction" key={entry.id}>
                    <div><strong>{entry.descricao}</strong>
                        <div className="muted">{entry.pagamento ? 'Saída' : 'Entrada'} · <time dateTime={date}>{dateLabel(date)}</time></div>
                    </div>
                    <span className="transaction-value">{entry.pagamento ? '−' : '+'}{money.format(entry.valor / 100)}</span>
                </li>;
            })}</ul>}
    </>;
}

export function ServiceReport({ summary, description }: { summary: ServiceSummary; description: string }) {
    const headingId = useId();
    return <section className="service-report" aria-labelledby={headingId}>
        <h3 id={headingId}>Situação de {description} · {summary.situacao}</h3>
        <Amounts values={[['Saldo a receber', summary.saldo, true], ['Recebido', summary.recebido],
            ['Custo direto', summary.custoDireto], ['Diferença após custos diretos', summary.diferenca]]} />
    </section>;
}

