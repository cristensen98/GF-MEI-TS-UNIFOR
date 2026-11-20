import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { kinds } from '../domain/model.ts';
import type { Draft, Entry, Kind } from '../domain/model.ts';
import { money, request } from './client.ts';
import { EntryForm } from './entry-form.tsx';
import { dateLabel, MonthlyReport, ServiceReport } from './summary.tsx';
import type { MonthSummary, ServiceSummary } from './summary.tsx';
import './style.css';

const labels = { servicos: 'Serviços', despesas: 'Despesas', recebimentos: 'Recebimentos' };
const newLabels = { servicos: 'Novo serviço', despesas: 'Nova despesa', recebimentos: 'Novo recebimento' };

function App() {
    const [view, setView] = useState<Kind | 'resumo'>('resumo');
    const [month, setMonth] = useState(new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit' }).format(new Date()));
    const [entries, setEntries] = useState<Entry[]>([]);
    const [services, setServices] = useState<Entry[]>([]);
    const [receivedByService, setReceivedByService] = useState(new Map<number, number>());
    const [summary, setSummary] = useState<MonthSummary | null>(null);
    const [detailEntry, setDetailEntry] = useState<Entry | null>(null);
    const [detail, setDetail] = useState<ServiceSummary | null>(null);
    const [detailError, setDetailError] = useState('');
    const [form, setForm] = useState<{ entry: Entry | null } | null>(null);
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const heading = useRef<HTMLHeadingElement>(null);
    const formTrigger = useRef<HTMLButtonElement>(null);
    const newButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        let active = true;
        async function load() {
            try {
                if (view === 'resumo') {
                    const result = month ? await request<MonthSummary>('resumo/' + month) : null;
                    if (active) setSummary(result);
                } else {
                    const [list, linked] = await Promise.all([
                        request<Entry[]>(view),
                        request<Entry[]>(view === 'servicos' ? 'recebimentos' : 'servicos')
                    ]);
                    if (!active) return;
                    setEntries(list);
                    if (view === 'servicos') {
                        const totals = new Map<number, number>();
                        for (const entry of linked) {
                            if (!entry.cancelado && entry.servico !== null) {
                                totals.set(entry.servico, (totals.get(entry.servico) ?? 0) + entry.valor);
                            }
                        }
                        setReceivedByService(totals);
                    } else {
                        setServices(linked);
                    }
                }
            } catch (problem) {
                if (active) setError((problem as Error).message);
            } finally {
                if (active) setLoading(false);
            }
        }
        void load();
        return () => { active = false; };
    }, [view, month, revision]);

    useEffect(() => {
        if (!detailEntry) return;
        let active = true;
        void request<ServiceSummary>('servicos/' + detailEntry.id + '/resumo').then(result => {
            if (active) setDetail(result);
        }).catch(problem => {
            if (active) setDetailError((problem as Error).message);
        });
        return () => { active = false; };
    }, [detailEntry]);

    function changeView(next: Kind | 'resumo') {
        if (next === view || busy) return;
        setView(next);
        setEntries([]);
        setServices([]);
        setForm(null);
        setDetailEntry(null);
        setDetail(null);
        setDetailError('');
        setSummary(null);
        setError('');
        setNotice('');
        setLoading(true);
        requestAnimationFrame(() => heading.current?.focus());
    }

    function closeForm() {
        setForm(null);
        requestAnimationFrame(() => (formTrigger.current ?? newButton.current)?.focus());
    }

    async function mutate(path: string, method: string, draft?: Draft) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await request(path, method, draft);
            setDetailEntry(null);
            setDetail(null);
            setDetailError('');
            setLoading(true);
            setRevision(value => value + 1);
            setNotice(method === 'DELETE' ? 'Lançamento cancelado.' : 'Lançamento salvo.');
        } finally {
            setBusy(false);
        }
    }

    const title = view === 'resumo' ? 'Resumo mensal' : labels[view];

    return <>
        <a className="skip-link" href="#section-title">Pular para o conteúdo</a>
        <header className="site-header">
            <div className="shell">
                <h1>GF-MEI</h1>
                <nav aria-label="Áreas do sistema">
                    {(['resumo', ...kinds] as const).map(page =>
                        <button key={page} aria-current={page === view ? 'page' : undefined}
                            aria-disabled={busy || undefined} onClick={() => changeView(page)}>
                            {page === 'resumo' ? 'Resumo mensal' : labels[page]}
                        </button>)}
                </nav>
            </div>
        </header>
        <main className="shell">
            <div className="section-heading">
                <h2 id="section-title" tabIndex={-1} ref={heading}>{title}</h2>
                {view === 'resumo' ? <label className="month-control">Mês de referência
                    <input type="month" value={month} onChange={event => {
                        setMonth(event.target.value);
                        setSummary(null);
                        setError('');
                        setLoading(Boolean(event.target.value));
                    }} />
                </label> : <button ref={newButton} className="primary" disabled={busy}
                    aria-expanded={Boolean(form && !form.entry)}
                    aria-controls={form && !form.entry ? 'entry-form' : undefined}
                    onClick={event => {
                        if (form && !form.entry) {
                            closeForm();
                            return;
                        }
                        formTrigger.current = event.currentTarget;
                        setForm({ entry: null });
                    }}>{newLabels[view]}</button>}
            </div>
            <p role="alert">{error}</p>
            <p role="status">{notice}</p>
            <p role="status">{loading ? 'Carregando…' : ''}</p>
            {view === 'resumo' ? summary && <MonthlyReport summary={summary} /> : <>
                {form && !form.entry && <EntryForm key={view} kind={view} selected={null} services={services}
                    busy={busy} close={closeForm} save={async draft => {
                        await mutate(view, 'POST', draft);
                        closeForm();
                    }} />}
                {!loading && !error && entries.length === 0 && <p className="empty">Nenhum lançamento cadastrado.</p>}
                <ul className="entries" role="list">{entries.map(entry => {
                    const received = receivedByService.get(entry.id) ?? 0;
                    const status = entry.cancelado ? 'Cancelado' : view !== 'servicos' ? null :
                        received === entry.valor ? 'Quitado' : received > 0 ? 'Parcial' : 'Em aberto';
                    const editing = form?.entry?.id === entry.id;
                    const showingDetail = detailEntry?.id === entry.id;
                    return <li key={entry.id}>
                        <div className="transaction">
                            <div>
                                <strong>{entry.descricao}</strong>
                                {status && <span className="entry-status">{status}</span>}
                                <div className="muted"><time dateTime={entry.data}>{dateLabel(entry.data)}</time>
                                    {entry.detalhe ? ' · ' + entry.detalhe : ''}</div>
                            </div>
                            <span className="transaction-value">{money.format(entry.valor / 100)}</span>
                        </div>
                        {!entry.cancelado && <div className="actions">
                            <button disabled={busy} aria-label={'Editar ' + entry.descricao} aria-expanded={editing}
                                aria-controls={editing ? 'entry-form' : undefined} onClick={event => {
                                    if (editing) {
                                        closeForm();
                                        return;
                                    }
                                    formTrigger.current = event.currentTarget;
                                    setForm({ entry });
                                }}>Editar</button>
                            {view === 'servicos' && <button disabled={busy} aria-label={'Ver situação de ' + entry.descricao}
                                aria-expanded={showingDetail} aria-controls={showingDetail ? 'service-details' : undefined}
                                onClick={() => {
                                    setDetail(null);
                                    setDetailError('');
                                    setDetailEntry(showingDetail ? null : entry);
                                }}>Ver situação</button>}
                            <button className="danger" disabled={busy} aria-label={'Cancelar lançamento ' + entry.descricao}
                                onClick={() => {
                                    if (window.confirm('Cancelar o lançamento “' + entry.descricao + '”?')) {
                                        void mutate(view + '/' + entry.id, 'DELETE').then(() => {
                                            if (editing) setForm(null);
                                            requestAnimationFrame(() => newButton.current?.focus());
                                        }).catch(problem => {
                                            setError(problem.message);
                                            setNotice('');
                                            requestAnimationFrame(() =>
                                                document.getElementById('cancel-' + entry.id)?.focus());
                                        });
                                    }
                                }} id={'cancel-' + entry.id}>Cancelar lançamento</button>
                        </div>}
                        {editing && <EntryForm kind={view} selected={entry} services={services} busy={busy}
                            close={closeForm} save={async draft => {
                                await mutate(view + '/' + entry.id, 'PUT', draft);
                                closeForm();
                            }} />}
                        {showingDetail && <div id="service-details">
                            <p role="alert">{detailError}</p>
                            <p role="status">{!detail && !detailError ? 'Carregando situação…' : ''}</p>
                            {detail && <ServiceReport summary={detail} description={entry.descricao} />}
                        </div>}
                    </li>;
                })}</ul>
            </>}
        </main>
    </>;
}

createRoot(document.getElementById('root')!).render(<App />);

