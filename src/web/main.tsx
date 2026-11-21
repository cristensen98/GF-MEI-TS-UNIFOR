import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { kinds, serviceTotal } from '../domain/model.ts';
import { businessDate } from '../domain/calendar.ts';
import type { Draft, Entry, Kind } from '../domain/model.ts';
import { formatMoney, request } from './client.ts';
import { EntryForm } from './entry-form.tsx';
import { DataTable } from './data-table.tsx';
import { ActionButton } from './action-button.tsx';
import { StatusBadge } from './status-badge.tsx';
import { Modal } from './modal.tsx';
import { dateLabel, MonthlyReport, ServiceReport } from './summary.tsx';
import type { MonthSummary, ServiceSummary } from './summary.tsx';
import './style.css';

const labels = { servicos: 'Serviços', despesas: 'Despesas', recebimentos: 'Recebimentos' };
const newLabels = { servicos: 'Novo serviço', despesas: 'Nova despesa', recebimentos: 'Novo recebimento' };

function entryStatus(kind: Kind, entry: Entry) {
    if (entry.cancelado) return 'Cancelado';
    if (kind === 'recebimentos') return 'Recebido';
    if (kind === 'despesas') return entry.pagamento ? 'Paga' : 'A pagar';
    return null;
}

function normalizeSearch(value: string) {
    return value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{M}/gu, '');
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

interface Session { usuario: string; administrador: boolean }

function PasswordField({ name, label, creating, busy, optional = false }: {
    name: string;
    label: string;
    creating: boolean;
    busy: boolean;
    optional?: boolean;
}) {
    const [visible, setVisible] = useState(false);
    return <div className="password-field">
        <label htmlFor={'auth-' + name}>{label}</label>
        <div className="password-control">
            <input id={'auth-' + name} name={name} type={visible ? 'text' : 'password'}
                autoComplete={creating ? 'new-password' : 'current-password'}
                required={!optional} readOnly={busy} minLength={creating ? 12 : undefined} maxLength={1024}
                autoCapitalize="none" spellCheck={false} />
            <button type="button" aria-label={(visible ? 'Ocultar ' : 'Mostrar ') + label.toLowerCase()}
                aria-controls={'auth-' + name} onClick={() => setVisible(current => !current)}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="2.7" />
                    {!visible && <path d="m3 21 18-18" />}
                </svg>
            </button>
        </div>
    </div>;
}

interface Account { usuario: string; aprovado: boolean; administrador: boolean; contaInstalacao?: boolean }

function Accounts({ currentUser }: { currentUser: string }) {
    const [accounts, setAccounts] = useState<Account[] | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [editor, setEditor] = useState<{ trigger: HTMLButtonElement; account?: Account } | null>(null);
    const [saving, setSaving] = useState(false);
    const [editorError, setEditorError] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    useEffect(() => {
        let active = true;
        void request<Account[]>('auth/accounts').then(result => {
            if (active) setAccounts(result);
        }).catch(problem => { if (active) setError(problem.message); });
        return () => { active = false; };
    }, []);

    async function approve(usuario: string) {
        setPending(usuario);
        setError('');
        setNotice('');
        try {
            await request('auth/accounts/' + encodeURIComponent(usuario) + '/approve', 'POST');
            setAccounts(current => current?.map(account => account.usuario === usuario ? { ...account, aprovado: true } : account) ?? []);
            setNotice('Conta de ' + usuario + ' aprovada.');
        } catch (problem) {
            setError((problem as Error).message);
        } finally {
            setPending(null);
        }
    }

    async function saveAccount(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const previous = editor?.account;
        const credentials = Object.fromEntries(new FormData(event.currentTarget));
        setSaving(true);
        setEditorError('');
        setNotice('');
        try {
            const account = previous ? await request<Account>('auth/accounts/' + encodeURIComponent(previous.usuario),
                'PUT', { ...credentials, administrador: credentials.perfil === 'administrador' }) :
                await request<Account>('auth/accounts', 'POST', credentials);
            setAccounts(current => previous ? current?.map(item => item.usuario === previous.usuario ? account : item) ?? [] :
                [...(current ?? []), account]);
            setEditor(null);
            if (previous?.usuario === currentUser) {
                window.dispatchEvent(new Event('gfmei:session-ended'));
                return;
            }
            setNotice(previous ? 'Conta de ' + account.usuario + ' atualizada.' : 'Conta de ' + account.usuario + ' criada e liberada.');
        } catch (problem) {
            setEditorError((problem as Error).message);
        } finally {
            setSaving(false);
        }
    }

    return <>
        <button type="button" className="primary" aria-haspopup="dialog" disabled={!accounts || pending !== null}
            onClick={event => {
                setEditorError('');
                setEditor({ trigger: event.currentTarget });
            }}>Criar usuário</button>
        <p role="alert">{error}</p>
        <p role="status">{notice || (accounts ? '' : error ? '' : 'Carregando contas…')}</p>
        {accounts?.length === 0 && <p className="empty">Nenhum usuário cadastrado pela equipe.</p>}
        {accounts && accounts.length > 0 && <DataTable label="Contas de usuários"
            columns={['Usuário', 'Perfil', 'Situação', 'Ações']}>{accounts.map(account => {
            const { usuario, aprovado, administrador, contaInstalacao } = account;
            return (
            <tr key={usuario}><th scope="row">{usuario}</th>
                <td>{contaInstalacao ? 'Administrador da instalação' : administrador ? 'Administrador' : 'Usuário comum'}</td>
                <td><StatusBadge status={aprovado ? 'Aprovado' : 'Pendente'} /></td>
                <td>{contaInstalacao ? '—' : <div className="actions">
                    <ActionButton icon="edit" aria-haspopup="dialog" label={'Editar ' + usuario} disabled={pending !== null}
                        onClick={event => {
                            setEditorError('');
                            setEditor({ trigger: event.currentTarget, account });
                        }} />
                    {!aprovado && <ActionButton icon={pending === usuario ? 'pending' : 'approve'}
                        label={(pending === usuario ? 'Aprovando ' : 'Aprovar ') + usuario} disabled={pending !== null}
                        onClick={() => void approve(usuario)} />}
                </div>}</td>
            </tr>);
        })}</DataTable>}
        {editor && <Modal title={editor.account ? 'Editar ' + editor.account.usuario : 'Criar usuário'}
            trigger={editor.trigger} busy={saving} close={() => setEditor(null)}>
            <form className="login-form" onSubmit={saveAccount}>
                <p className="muted">{editor.account ? 'Preencha a nova senha apenas se quiser alterá-la.' :
                    'O usuário poderá entrar assim que a conta for criada.'}</p>
                <label>Usuário<input name="usuario" autoComplete="username" required data-initial-focus
                    minLength={3} maxLength={32} pattern={'[a-zA-Z0-9._\\-]{3,32}'} readOnly={saving}
                    defaultValue={editor.account?.usuario} /></label>
                <PasswordField name="senha" label={editor.account ? 'Nova senha (opcional)' : 'Senha'}
                    creating optional={Boolean(editor.account)} busy={saving} />
                <PasswordField name="confirmacao" label="Confirmação da senha"
                    creating optional={Boolean(editor.account)} busy={saving} />
                {editor.account && <label>Perfil de acesso
                    <select name="perfil" defaultValue={editor.account.administrador ? 'administrador' : 'comum'}>
                        <option value="comum">Usuário comum</option>
                        <option value="administrador">Administrador</option>
                    </select>
                </label>}
                <p role="alert">{editorError}</p>
                <button type="submit" className="primary" disabled={saving}>
                    {saving ? 'Salvando…' : editor.account ? 'Salvar alterações' : 'Criar usuário'}
                </button>
            </form>
        </Modal>}
    </>;
}

function App() {
    const [session, setSession] = useState<Session | null | undefined>();
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(true);
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    const [registering, setRegistering] = useState(false);
    const [notice, setNotice] = useState('');

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
        setNotice('');
        try {
            if (registering) {
                await request('auth/register', 'POST', Object.fromEntries(data));
                setRegistering(false);
                setNotice('Conta criada. Aguarde a aprovação do administrador antes de entrar.');
            } else {
                setSession(await request<Session>('auth/login', 'POST', Object.fromEntries(data)));
            }
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

    if (session) return <Workspace usuario={session.usuario} administrador={session.administrador}
        exit={() => void logout()} exiting={busy} sessionError={error} />;
    return <main className="local-exit">
        <div className="brand"><span className="brand-mark" aria-hidden="true">GF</span><h1>GF-MEI</h1></div>
        <p role="alert">{error}</p>
        <p role="status">{notice}</p>
        {checking ? <p role="status">Verificando sessão…</p> : session === undefined ?
            <button type="button" onClick={() => {
                setChecking(true);
                setError('');
                setRevision(value => value + 1);
            }}>Tentar novamente</button> :
            <form key={registering ? 'register' : 'login'} className="login-form" onSubmit={submitCredentials}>
                <h2>{registering ? 'Criar conta' : 'Entrar'}</h2>
                {registering && <p className="muted">Sua conta ficará pendente até a aprovação do administrador.</p>}
                <label>Usuário<input name="usuario" autoComplete="username" required autoFocus readOnly={busy}
                    minLength={registering ? 3 : undefined} maxLength={registering ? 32 : undefined}
                    pattern={registering ? '[a-zA-Z0-9._\\-]{3,32}' : undefined} /></label>
                <PasswordField name="senha" label="Senha" creating={registering} busy={busy} />
                {registering && <PasswordField name="confirmacao" label="Confirmação da senha" creating busy={busy} />}
                <button className="primary" type="submit" disabled={busy}>
                    {busy ? 'Aguarde…' : registering ? 'Solicitar cadastro' : 'Entrar'}
                </button>
                <button type="button" disabled={busy} onClick={() => {
                    setError('');
                    setNotice('');
                    setRegistering(!registering);
                }}>{registering ? 'Voltar ao login' : 'Criar conta'}</button>
            </form>}
    </main>;
}

function Workspace({ usuario, administrador, exit, exiting, sessionError }: {
    usuario: string;
    administrador: boolean;
    exit: () => void;
    exiting: boolean;
    sessionError: string;
}) {
    const [view, setView] = useState<Kind | 'resumo' | 'usuarios'>('resumo');
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
        if (view === 'usuarios') return;
        let active = true;
        async function load() {
            try {
                if (view === 'resumo') {
                    const result = month ? await request<MonthSummary>('resumo/' + month) : null;
                    if (active) setSummary(result);
                } else if (view !== 'usuarios') {
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

    function changeView(next: Kind | 'resumo' | 'usuarios', focusHeading = true) {
        if (busy || (next === 'usuarios' && !administrador)) return;
        setQuery('');
        if (next === view) return;
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
        setLoading(next !== 'usuarios');
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

    const pages = { ...labels, resumo: 'Visão geral', usuarios: 'Usuários' };
    const searchText = normalizeSearch(query);

    return <>
        <a className="skip-link" href="#section-title">Pular para o conteúdo</a>
        <header className="site-header">
            <div className="shell">
                <div className="brand"><span className="brand-mark" aria-hidden="true">GF</span><div><h1>GF-MEI</h1><p>Gestão financeira</p></div></div>
                <nav aria-label="Áreas do sistema">
                    {(['resumo', ...kinds, ...(administrador ? ['usuarios'] as const : [])] as const).map(page =>
                        <button key={page} aria-current={page === view ? 'page' : undefined}
                            aria-disabled={busy || undefined} onClick={() => changeView(page)}>
                            {pages[page]}
                        </button>)}
                </nav>
                <button type="button" className="sidebar-exit" disabled={busy || exiting} onClick={exit}>{exiting ? 'Saindo…' : 'Sair'}</button>
            </div>
        </header>
        <div className="workspace">
        <header className="workspace-bar">
            <div className="shell workspace-bar-content">
                {view !== 'usuarios' && <div role="search" className="workspace-search">
                    <label htmlFor="workspace-search">Buscar lançamentos</label>
                    <input id="workspace-search" type="search" value={query}
                        placeholder="Descrição, categoria ou cliente" onChange={event => setQuery(event.target.value)} />
                </div>}
                <div className="workspace-user">
                    <span className="user-avatar" aria-hidden="true">{Array.from(usuario)[0].toLocaleUpperCase('pt-BR')}</span>
                    <div><strong>{usuario}</strong></div>
                </div>
            </div>
        </header>
        <main className="shell">
            <p role="alert">{sessionError}</p>
            <div className="section-heading">
                <h2 id="section-title" tabIndex={-1} ref={heading}>{searchText ? 'Resultados da busca' : pages[view]}</h2>
                {!searchText && view !== 'usuarios' && (view === 'resumo' ? <label className="month-control">Mês de referência
                    <input type="month" value={month} onChange={event => {
                        setMonth(event.target.value);
                        setSummary(null);
                        setError('');
                        setLoading(Boolean(event.target.value));
                    }} />
                </label> : <button ref={newButton} className="primary" disabled={busy}
                    aria-haspopup="dialog"
                    onClick={event => {
                        formTrigger.current = event.currentTarget;
                        setForm({ entry: null });
                    }}>{newLabels[view]}</button>)}
            </div>
            {view === 'usuarios' ? administrador && <Accounts currentUser={usuario} /> : searchText ? <SearchResults query={searchText} open={(kind, id) => {
                changeView(kind, false);
                setSearchTarget(id);
            }} /> : <>
            <p role="alert">{error}</p>
            <p role="status">{notice}</p>
            <p role="status">{loading ? 'Carregando…' : ''}</p>
            {view === 'resumo' ? summary && <MonthlyReport summary={summary} month={month} /> : <>
                {form && <Modal title={form.entry ? 'Editar ' + form.entry.descricao : newLabels[view]}
                    trigger={formTrigger.current} busy={busy} close={closeForm}>
                    <EntryForm kind={view} selected={form.entry} services={services}
                        busy={busy} close={closeForm} save={async draft => {
                            const entry = form.entry;
                            await mutate(entry ? view + '/' + entry.id : view, entry ? 'PUT' : 'POST', draft);
                            closeForm();
                        }} />
                </Modal>}
                {!loading && !error && entries.length === 0 && <p className="empty">Nenhum lançamento cadastrado.</p>}
                {entries.length > 0 && <DataTable key={view} label={labels[view]}
                    targetRow={searchTarget === null ? -1 : entries.findIndex(entry => entry.id === searchTarget)} columns={[
                    'Descrição', 'Data', view === 'servicos' ? 'Cliente' : view === 'despesas' ? 'Categoria' : 'Serviço',
                    'Situação', ...(view === 'servicos' ? ['Serviço', 'Custo direto', 'Total'] : ['Valor']), 'Ações'
                ]}>{entries.map(entry => {
                    const received = receivedByService.get(entry.id) ?? 0;
                    const status = entryStatus(view, entry) ??
                        (received === serviceTotal(entry) ? 'Quitado' : received > 0 ? 'Parcial' : 'Em aberto');
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
                        <td>{entry.cancelado ? '—' : <div className="actions">
                            <ActionButton icon="edit" disabled={busy} label={'Editar ' + entry.descricao} aria-haspopup="dialog"
                                onClick={event => {
                                    formTrigger.current = event.currentTarget;
                                    setForm({ entry });
                                }} />
                            {view === 'servicos' && <ActionButton icon="view" disabled={busy} label={'Ver situação de ' + entry.descricao}
                                aria-haspopup="dialog" onClick={event => {
                                    detailTrigger.current = event.currentTarget;
                                    setDetail(null);
                                    setDetailError('');
                                    setDetailEntry(entry);
                                }} />}
                            <ActionButton icon="cancel" disabled={busy} label={'Cancelar lançamento ' + entry.descricao}
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
                                }} id={'cancel-' + entry.id} />
                        </div>}</td>
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

createRoot(document.getElementById('root')!).render(<App />);

