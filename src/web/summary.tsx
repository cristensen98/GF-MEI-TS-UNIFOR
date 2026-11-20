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

function Amounts({ values }: { values: [string, number][] }) {
    return <dl className="amounts">{values.map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{money.format(value / 100)}</dd></div>)}</dl>;
}

export function MonthlyReport({ summary }: { summary: MonthSummary }) {
    return <>
        <Amounts values={[['Entradas', summary.entradas], ['Despesas pagas', summary.saidas], ['Resultado de caixa', summary.resultado]]} />
        <h3>Lançamentos do mês</h3>
        {summary.recebimentos.length + summary.despesas.length === 0 ? <p>Nenhum lançamento neste mês.</p> :
            <ul>{[...summary.recebimentos, ...summary.despesas].map(entry =>
                <li key={entry.id}>{entry.pagamento ? 'Saída' : 'Entrada'} · {entry.pagamento ?? entry.data} · {entry.descricao} · {money.format(entry.valor / 100)}</li>
            )}</ul>}
    </>;
}

export function ServiceReport({ summary }: { summary: ServiceSummary }) {
    return <section>
        <h3>Situação do serviço · {summary.situacao}</h3>
        <Amounts values={[['Recebido', summary.recebido], ['Saldo a receber', summary.saldo],
            ['Custo direto', summary.custoDireto], ['Diferença após custos diretos', summary.diferenca]]} />
    </section>;
}

