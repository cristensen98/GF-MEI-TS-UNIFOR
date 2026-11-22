import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { expenseCategories, kinds, serviceTotal } from '../domain/model.ts';
import { businessDate } from '../domain/calendar.ts';
import type { Draft, Entry, Kind } from '../domain/model.ts';
import { formatMoney, request } from './client.ts';
import { EntryForm } from './entry-form.tsx';
import { DataTable } from './data-table.tsx';
import { ActionButton } from './action-button.tsx';
import { AnnualEvolution } from './annual-evolution.tsx';
import { MonthSelect } from './month-select.tsx';
import { ProfileMenu } from './profile-menu.tsx';
import { PasswordField } from './password-field.tsx';
import { StatusBadge } from './status-badge.tsx';
import { Modal } from './modal.tsx';
import { dateLabel, MonthlyReport, ServiceReport } from './summary.tsx';
import type { MonthSummary, ServiceSummary } from './summary.tsx';
import './style.css';
import { initializeTheme } from './theme.ts';

const labels = { servicos: 'Serviços', despesas: 'Despesas', recebimentos: 'Recebimentos' };
const newLabels = { servicos: 'Novo serviço', despesas: 'Nova despesa', recebimentos: 'Novo recebimento' };
const statusOptions = {
    servicos: ['Em aberto', 'Parcial', 'Quitado', 'Cancelado'],
    despesas: ['A pagar', 'Paga', 'Cancelado'],
    recebimentos: ['Recebido', 'Cancelado']
};
type View = Kind | 'resumo' | 'evolucao';

const sidebarIconPaths = {
    resumo: 'M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9',
    evolucao: 'M3 3v18h18M7 15l4-4 4 2 5-6m-4 0h4v4',
    servicos: 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm0 4h18m-11 0v2h4v-2',
    despesas: 'M5 3l2.5 2L10 3l2 2 2-2 2.5 2L19 3v18l-2.5-2L14 21l-2-2-2 2-2.5-2L5 21zm4 9h6',
    recebimentos: 'M12 3v11m-4-4 4 4 4-4M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
    sair: 'M10 17l5-5-5-5m5 5H3m11-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5'
};

function SidebarIcon({ name }: { name: View | 'sair' }) {
    return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"
        className="sidebar-icon" fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round">
        <path d={sidebarIconPaths[name]} />
    </svg>;
}

function entryStatus(kind: Kind, entry: Entry) {
    if (entry.cancelado) return 'Cancelado';
    if (kind === 'recebimentos') return 'Recebido';
    if (kind === 'despesas') return entry.pagamento ? 'Paga' : 'A pagar';
    return null;
}

function normalizeSearch(value: string) {
    return value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{M}/gu, '');
}

function DateFilter({ label, value, min, max, onChange }: {
    label: string; value: string; min?: string; max?: string; onChange: (value: string) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const openCalendar = () => {
        if (!input.current) return;
        try {
            if (input.current.showPicker) {
                input.current.showPicker();
                return;
            }
        } catch {
            // Alguns navegadores não abrem o seletor nativo de um campo discreto.
        }
        input.current.focus();
        input.current.click();
    };
    return <div className="table-date-filter">
        <span className="table-filter-label">{label}</span>
        <div className="table-date-control">
            <button type="button" className="table-date-button" aria-label={`${label}: ${value ? dateLabel(value) : 'qualquer data'}. Abrir calendário`}
                onClick={openCalendar} title={`${label}: ${value ? dateLabel(value) : 'qualquer data'}`}>
                <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" />
                </svg>
            </button>
            {value && <span className="table-date-value">{dateLabel(value)}</span>}
        </div>
        <input ref={input} className="table-date-input" type="date" aria-label={label} tabIndex={-1}
            value={value} min={min} max={max} onChange={event => onChange(event.target.value)} />
    </div>;
}

function SearchResults({ query, open }: { query: string; open: (kind: Kind, id: number) => void }) {
    const [groups, setGroups] = useState<{ kind: Kind; entries: Entry[] }[] | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        void Promise.all(kinds.map(async kind => ({ kind, entries: await request<Entry[]>(kind) })))
            .then(results => { if (active) setGroups(results); })
            .catch(problem => { if (active) setError((problem as Error).message); });
        return () => { active = false; };
    }, []);
    const results = groups?.flatMap(({ kind, entries }) => entries
        .filter(entry => [entry.descricao, entry.detalhe ?? '', labels[kind]].some(value => normalizeSearch(value).includes(query)))
        .map(entry => ({ kind, entry })))
        .sort((first, second) => second.entry.data.localeCompare(first.entry.data) || second.entry.id - first.entry.id);
    return <>
        <p role="alert">{error}</p>
        <p role="status">{results ? (results.length ? `${results.length} lançamento(s) encontrado(s).` :
            'Nenhum lançamento corresponde à pesquisa.') : error ? '' : 'Buscando lançamentos…'}</p>
        {results && results.length > 0 && <DataTable key={query} label="Resultados da busca"
            columns={['Descrição', 'Tipo', 'Data', 'Detalhe', 'Situação', 'Valor', 'Ações']}>{results.map(({ kind, entry }) => {
            const status = entryStatus(kind, entry);
            return <tr key={entry.id}>
                <th scope="row">{entry.descricao}</th>
                <td>{labels[kind]}</td>
                <td><time dateTime={entry.data}>{dateLabel(entry.data)}</time></td>
                <td>{entry.detalhe || '—'}</td>
                <td>{status ? <StatusBadge status={status} /> : '—'}</td>
                <td className="table-number">{formatMoney(kind === 'servicos' ? serviceTotal(entry) : entry.valor)}</td>
                <td><ActionButton icon="view" label={`Ver ${entry.descricao}, ${dateLabel(entry.data)}, em ${labels[kind]}`}
                    onClick={() => open(kind, entry.id)} /></td>
            </tr>;
        })}</DataTable>}
    </>;
}

interface Session { usuario: string }

function App() {
    const [session, setSession] = useState<Session | null | undefined>();
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(true);
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    const [registering, setRegistering] = useState(false);

    useEffect(() => {
        let active = true;
        const expire = () => {
            setSession(null);
            setError('Entre novamente para continuar.');
        };
        window.addEventListener('gfmei:session-ended', expire);
        void request<Session | null>('auth/session').then(result => {
            if (active) setSession(result);
        }).catch(() => {
            if (active) setError('Não foi possível verificar sua sessão. Tente novamente.');
        }).finally(() => {
            if (active) setChecking(false);
        });
        return () => {
            active = false;
            window.removeEventListener('gfmei:session-ended', expire);
        };
    }, [revision]);

    async function submitCredentials(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setError('');
        try {
            setSession(await request<Session>(registering ? 'auth/register' : 'auth/login', 'POST', Object.fromEntries(data)));
            setRegistering(false);
        } catch (problem) {
            setError((problem as Error).message);
        } finally {
            setBusy(false);
        }
    }

    async function logout() {
        setBusy(true);
        setError('');
        try {
            await request('auth/logout', 'POST');
            setSession(null);
        } catch {
            setError('Não foi possível sair. Tente novamente.');
        } finally {
            setBusy(false);
        }
    }

    if (session) return <Workspace key={session.usuario} usuario={session.usuario}
        exit={() => void logout()} exiting={busy} sessionError={error} />;
    return <main className="local-exit">
        <div className="brand"><span className="brand-mark" aria-hidden="true">GF</span><h1>GF-MEI</h1></div>
        <p role="alert">{error}</p>
        {checking ? <p role="status">Verificando sessão…</p> : session === undefined ?
            <button type="button" onClick={() => {
                setChecking(true);
                setError('');
                setRevision(value => value + 1);
            }}>Tentar novamente</button> :
            <form key={registering ? 'register' : 'login'} className="login-form" onSubmit={submitCredentials}>
                <h2>{registering ? 'Criar conta' : 'Entrar'}</h2>
                {registering && <p className="muted">Crie sua conta para acessar seu espaço financeiro.</p>}
                <label>Usuário<input name="usuario" autoComplete="username" required autoFocus readOnly={busy}
                    minLength={registering ? 3 : undefined} maxLength={registering ? 32 : undefined}
                    pattern={registering ? '[a-zA-Z0-9._\\-]{3,32}' : undefined} /></label>
                <PasswordField name="senha" label="Senha" creating={registering} busy={busy} />
                {registering && <PasswordField name="confirmacao" label="Confirmação da senha" creating busy={busy} />}
                <button className="primary" type="submit" disabled={busy}>
                    {busy ? 'Aguarde…' : registering ? 'Criar conta e entrar' : 'Entrar'}
                </button>
                <button type="button" disabled={busy} onClick={() => {
                    setError('');
                    setRegistering(!registering);
                }}>{registering ? 'Voltar ao login' : 'Criar conta'}</button>
            </form>}
    </main>;
}

function Workspace({ usuario, exit, exiting, sessionError }: {
    usuario: string;
    exit: () => void;
    exiting: boolean;
    sessionError: string;
}) {
    const [view, setView] = useState<View>('resumo');
    const [openingMonth, setOpeningMonth] = useState<string>();
    const [month, setMonth] = useState(() => businessDate().slice(0, 7));
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
    const [query, setQuery] = useState('');
    const [searchTarget, setSearchTarget] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [nameFilter, setNameFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    function clearTableFilters() {
        setStatusFilter('');
        setNameFilter('');
        setCategoryFilter('');
        setDateFrom('');
        setDateTo('');
    }
    const heading = useRef<HTMLHeadingElement>(null);
    const formTrigger = useRef<HTMLButtonElement>(null);
    const detailTrigger = useRef<HTMLButtonElement>(null);
    const newButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (loading || searchTarget === null) return;
        (document.getElementById('entry-' + searchTarget) ?? heading.current)?.focus();
        setSearchTarget(null);
    }, [loading, searchTarget]);

    useEffect(() => {
        if (view === 'evolucao') return;
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

    function changeView(next: View, focusHeading = true) {
        if (busy) return;
        setQuery('');
        if (next === view) return;
        setView(next);
        clearTableFilters();
        setEntries([]);
        setServices([]);
        setForm(null);
        setDetailEntry(null);
        setDetail(null);
        setDetailError('');
        setSummary(null);
        setError('');
        setNotice('');
        setLoading(next !== 'evolucao');
        if (focusHeading) requestAnimationFrame(() => heading.current?.focus());
    }

    function closeForm() {
        setForm(null);
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

    const pages = { ...labels, resumo: 'Visão geral', evolucao: 'Evolução anual' };
    const searchText = normalizeSearch(query);
    function statusFor(entry: Entry) {
        if (view === 'resumo' || view === 'evolucao') return '';
        const received = receivedByService.get(entry.id) ?? 0;
        return entryStatus(view, entry) ??
            (received === serviceTotal(entry) ? 'Quitado' : received > 0 ? 'Parcial' : 'Em aberto');
    }
    const normalizedName = normalizeSearch(nameFilter);
    const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
    const categories = [...new Set([...expenseCategories, ...entries
        .map(entry => entry.detalhe).filter((value): value is string => Boolean(value))])]
        .sort((first, second) => first.localeCompare(second, 'pt-BR'));
    const filteredEntries = entries.filter(entry => {
        const linkedService = view === 'recebimentos'
            ? services.find(service => service.id === entry.servico) : undefined;
        const name = [entry.descricao, view === 'servicos' ? entry.detalhe : '',
            linkedService?.descricao, linkedService?.detalhe].filter(Boolean).join(' ');
        return !invalidDateRange &&
            (!statusFilter || statusFor(entry) === statusFilter) &&
            (!normalizedName || normalizeSearch(name).includes(normalizedName)) &&
            (!categoryFilter || entry.detalhe === categoryFilter) &&
            (!dateFrom || entry.data >= dateFrom) &&
            (!dateTo || entry.data <= dateTo);
    });
    const filtersKey = JSON.stringify([view, statusFilter, nameFilter, categoryFilter, dateFrom, dateTo]);
    function changeMonth(next: string) {
        if (next === month) return;
        setMonth(next);
        setSummary(null);
        setError('');
        setLoading(true);
    }


    return <>
        <a className="skip-link" href="#section-title">Pular para o conteúdo</a>
        <header className="site-header">
            <div className="shell">
                <div className="brand"><span className="brand-mark" aria-hidden="true">GF</span><div><h1>GF-MEI</h1><p>Gestão financeira</p></div></div>
                <nav aria-label="Áreas do sistema">
                    {([
                        { title: 'Relatórios', pages: ['resumo', 'evolucao'] },
                        { title: 'Cadastro', pages: kinds }
                    ] satisfies { title: string; pages: readonly View[] }[]).map(group =>
                    <section className="sidebar-group" key={group.title} aria-label={group.title}>
                        <h2 className="sidebar-group-title">{group.title}</h2>
                        {group.pages.map(page =>
                        <button key={page} aria-current={page === view ? 'page' : undefined}
                            aria-disabled={busy || undefined} onClick={() => changeView(page)}>
                            {pages[page]}
                            <SidebarIcon name={page} />
                        </button>)}
                    </section>)}
                </nav>
                <button type="button" className="sidebar-exit" disabled={busy || exiting} onClick={exit}>
                    {exiting ? 'Saindo…' : 'Sair'}
                    <SidebarIcon name="sair" />
                </button>
            </div>
        </header>
        <div className="workspace">
        <header className="workspace-bar">
            <div className="shell workspace-bar-content">
                <div role="search" className="workspace-search">
                    <label htmlFor="workspace-search">Buscar lançamentos</label>
                    <input id="workspace-search" type="search" value={query}
                        placeholder="Descrição, categoria ou cliente" onChange={event => setQuery(event.target.value)} />
                </div>
                <ProfileMenu username={usuario} exit={exit} exiting={exiting} busy={busy}
                    onOpeningMonthChange={setOpeningMonth} />
            </div>
        </header>
        <main className="shell">
            <p role="alert">{sessionError}</p>
            <div className="section-heading">
                <h2 id="section-title" tabIndex={-1} ref={heading}>{searchText ? 'Resultados da busca' : pages[view]}</h2>
                {!searchText && view !== 'evolucao' && (view === 'resumo' ?
                    <MonthSelect label="Período de referência" year={month.slice(0, 4)}
                        value={month.length === 4 ? '' : month} onChange={changeMonth} onAnnual={changeMonth} />
                    : <button ref={newButton} className="primary" disabled={busy}
                    aria-haspopup="dialog"
                    onClick={event => {
                        formTrigger.current = event.currentTarget;
                        setForm({ entry: null });
                    }}>{newLabels[view]}</button>)}
            </div>
            {searchText ? <SearchResults query={searchText} open={(kind, id) => {
                changeView(kind, false);
                clearTableFilters();
                setSearchTarget(id);
            }} /> : <>
            <p role="alert">{error}</p>
            <p role="status">{notice}</p>
            <p role="status">{loading ? 'Carregando…' : ''}</p>
            {view === 'resumo' ? summary && <MonthlyReport summary={summary} month={month} /> :
                view === 'evolucao' ? <AnnualEvolution key={month} month={month.length === 4 ? month + '-12' : month} openingMonth={openingMonth} /> : <>
                {form && <Modal title={form.entry ? 'Editar ' + form.entry.descricao : newLabels[view]}
                    trigger={formTrigger.current} busy={busy} close={closeForm}>
                    <EntryForm kind={view} selected={form.entry} services={services}
                        busy={busy} close={closeForm} save={async draft => {
                            const entry = form.entry;
                            await mutate(entry ? view + '/' + entry.id : view, entry ? 'PUT' : 'POST', draft);
                            closeForm();
                        }} />
                </Modal>}
                <div className="table-filters">
                    <label>Nome
                        <input type="search" value={nameFilter} placeholder={view === 'servicos'
                            ? 'Descrição ou cliente' : view === 'recebimentos' ? 'Descrição, serviço ou cliente' : 'Descrição da despesa'}
                            onChange={event => setNameFilter(event.target.value)} />
                    </label>
                    <DateFilter label="Data inicial" value={dateFrom} max={dateTo || undefined} onChange={setDateFrom} />
                    <DateFilter label="Data final" value={dateTo} min={dateFrom || undefined} onChange={setDateTo} />
                    {view === 'despesas' && <label>Categoria
                        <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
                            <option value="">Todas as categorias</option>
                            {categories.map(category => <option key={category} value={category}>{category}</option>)}
                        </select>
                    </label>}
                    <label>Situação
                        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                            <option value="">Todas as situações</option>
                            {statusOptions[view].map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </label>
                    <button type="button" onClick={clearTableFilters}>Limpar filtros</button>
                    {!loading && !error && <p role="status">{filteredEntries.length} de {entries.length} lançamentos</p>}
                </div>
                {invalidDateRange && <p role="alert">A data final deve ser igual ou posterior à data inicial.</p>}
                {!loading && !error && filteredEntries.length === 0 && <p className="empty">
                    {entries.length ? 'Nenhum lançamento encontrado para os filtros selecionados.' : 'Nenhum lançamento cadastrado.'}
                </p>}
                {filteredEntries.length > 0 && <DataTable key={filtersKey} label={labels[view]}
                    targetRow={searchTarget === null ? -1 : filteredEntries.findIndex(entry => entry.id === searchTarget)} columns={[
                    'Descrição', 'Data', view === 'servicos' ? 'Cliente' : view === 'despesas' ? 'Categoria' : 'Serviço',
                    'Situação', ...(view === 'servicos' ? ['Serviço', 'Custo direto', 'Total'] : ['Valor']), 'Ações'
                ]}>{filteredEntries.map(entry => {
                    const status = statusFor(entry);
                    return <tr key={entry.id} id={'entry-' + entry.id} tabIndex={-1}>
                            <th scope="row">{entry.descricao}</th>
                            <td><time dateTime={entry.data}>{dateLabel(entry.data)}</time></td>
                            <td>{view === 'recebimentos'
                                ? services.find(service => service.id === entry.servico)?.descricao ?? '—'
                                : entry.detalhe || '—'}</td>
                            <td>
                                {view === 'despesas' && !entry.cancelado && (entry.recorrente || entry.recorrenciaOrigem) &&
                                    <StatusBadge status="Mensal" />}
                                <StatusBadge status={status} />
                            </td>
                            <td className="table-number">{formatMoney(entry.valor)}</td>
                            {view === 'servicos' && <>
                                <td className="table-number">{formatMoney(entry.custoDireto ?? entry.custoMaterial ?? 0)}</td>
                                <td className="table-number">{formatMoney(serviceTotal(entry))}</td>
                            </>}
                        <td><div className="actions">
                            {<ActionButton icon="edit" disabled={busy} label={'Editar ' + entry.descricao} aria-haspopup="dialog"
                                onClick={event => {
                                    formTrigger.current = event.currentTarget;
                                    setForm({ entry });
                                }} />}
                            {view === 'servicos' && <ActionButton icon="view" disabled={busy} label={'Ver situação de ' + entry.descricao}
                                aria-haspopup="dialog" onClick={event => {
                                    detailTrigger.current = event.currentTarget;
                                    setDetail(null);
                                    setDetailError('');
                                    setDetailEntry(entry);
                                }} />}
                            {!entry.cancelado && <ActionButton icon="cancel" disabled={busy} label={'Cancelar lançamento ' + entry.descricao}
                                onClick={() => {
                                    if (window.confirm('Cancelar o lançamento “' + entry.descricao + '”?')) {
                                        void mutate(view + '/' + entry.id, 'DELETE').then(() => {
                                            requestAnimationFrame(() => newButton.current?.focus());
                                        }).catch(problem => {
                                            setError(problem.message);
                                            setNotice('');
                                            requestAnimationFrame(() =>
                                                document.getElementById('cancel-' + entry.id)?.focus());
                                        });
                                    }
                                }} id={'cancel-' + entry.id} />}
                        </div></td>
                    </tr>;
                })}</DataTable>}
                {detailEntry && <Modal title={'Situação de ' + detailEntry.descricao} trigger={detailTrigger.current}
                    close={() => setDetailEntry(null)}>
                    <p role="alert">{detailError}</p>
                    <p role="status">{!detail && !detailError ? 'Carregando situação…' : ''}</p>
                    {detail && <ServiceReport summary={detail} />}
                </Modal>}
            </>}
            </>}
        </main>
        </div>
    </>;
}

initializeTheme();
createRoot(document.getElementById('root')!).render(<App />);

