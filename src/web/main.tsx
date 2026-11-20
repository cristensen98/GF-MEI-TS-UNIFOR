import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { kinds } from '../domain/model.ts';
import type { Draft, Entry, Kind } from '../domain/model.ts';
import { money, request } from './client.ts';
import { EntryForm } from './entry-form.tsx';
import { MonthlyReport, ServiceReport } from './summary.tsx';
import type { MonthSummary, ServiceSummary } from './summary.tsx';
import './style.css';

const labels = { servicos: 'Serviços', despesas: 'Despesas', recebimentos: 'Recebimentos' };

function App() {
    const [view, setView] = useState<Kind | 'resumo'>('resumo');
    const [month, setMonth] = useState(new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit' }).format(new Date()));
    const [entries, setEntries] = useState<Entry[]>([]);
    const [services, setServices] = useState<Entry[]>([]);
    const [summary, setSummary] = useState<MonthSummary | null>(null);
    const [detail, setDetail] = useState<ServiceSummary | null>(null);
    const [selected, setSelected] = useState<Entry | null>(null);
    const [revision, setRevision] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        if (view === 'resumo') {
            if (month) request<MonthSummary>('resumo/' + month).then(result => {
                if (active) setSummary(result);
            }).catch(problem => { if (active) setError(problem.message); });
        } else {
            Promise.all([request<Entry[]>(view), request<Entry[]>('servicos')]).then(([list, linked]) => {
                if (active) {
                    setEntries(list);
                    setServices(linked);
                }
            }).catch(problem => { if (active) setError(problem.message); });
        }
        return () => { active = false; };
    }, [view, month, revision]);

    function changeView(next: Kind | 'resumo') {
        setView(next);
        setEntries([]);
        setServices([]);
        setSelected(null);
        setDetail(null);
        setSummary(null);
        setError('');
    }

    async function mutate(path: string, method: string, draft?: Draft) {
        setBusy(true);
        setError('');
        try {
            await request(path, method, draft);
            setSelected(null);
            setDetail(null);
            setRevision(value => value + 1);
        } finally {
            setBusy(false);
        }
    }

    return <main>
        <header><h1>GF-MEI</h1><p>Gestão Financeira para Microempreendedores Individuais</p></header>
        <nav aria-label="Áreas do sistema">
            <button disabled={busy || view === 'resumo'} onClick={() => changeView('resumo')}>Resumo mensal</button>
            {kinds.map(kind => <button key={kind} disabled={busy || view === kind}
                onClick={() => changeView(kind)}>{labels[kind]}</button>)}
        </nav>
        {error && <p role="alert">{error}</p>}
        {view === 'resumo' ? <section>
            <h2>Resumo mensal</h2>
            <label>Mês de referência<input type="month" value={month} onChange={event => {
                setMonth(event.target.value);
                setSummary(null);
                setError('');
            }} /></label>
            {summary && <MonthlyReport summary={summary} />}
        </section> : <section>
            <h2>{labels[view]}</h2>
            <EntryForm key={view + (selected?.id ?? 'novo')} kind={view} selected={selected} services={services}
                busy={busy} stop={() => setSelected(null)} reportError={setError}
                save={draft => mutate(selected ? view + '/' + selected.id : view, selected ? 'PUT' : 'POST', draft)} />
            {entries.length === 0 && <p>Nenhum lançamento cadastrado.</p>}
            <ul className="entries">{entries.map(entry => <li key={entry.id}>
                <strong>{entry.descricao}</strong>
                <span>{entry.data} · {money.format(entry.valor / 100)}{entry.detalhe ? ' · ' + entry.detalhe : ''}</span>
                {entry.cancelado ? <span>Cancelado</span> : <div className="actions">
                    <button disabled={busy} onClick={() => { setSelected(entry); setError(''); }}>Editar</button>
                    <button disabled={busy} onClick={() => {
                        if (window.confirm('Cancelar este lançamento?')) {
                            void mutate(view + '/' + entry.id, 'DELETE').catch(problem => setError(problem.message));
                        }
                    }}>Cancelar lançamento</button>
                    {view === 'servicos' && <button disabled={busy} onClick={() => {
                        void request<ServiceSummary>('servicos/' + entry.id + '/resumo').then(setDetail)
                            .catch(problem => setError(problem.message));
                    }}>Ver situação</button>}
                </div>}
            </li>)}</ul>
            {detail && <ServiceReport summary={detail} />}
        </section>}
    </main>;
}

createRoot(document.getElementById('root')!).render(<App />);

