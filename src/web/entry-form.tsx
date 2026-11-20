import { useEffect, useRef, useState } from 'react';
import { cents } from './client.ts';
import type { Draft, Entry, Kind } from '../domain/model.ts';
import type { FormEvent } from 'react';

interface Props {
    kind: Kind;
    selected: Entry | null;
    services: Entry[];
    save: (draft: Draft) => Promise<void>;
    close: () => void;
    busy: boolean;
}

export function EntryForm({ kind, selected, services, save, close, busy }: Props) {
    const description = useRef<HTMLInputElement>(null);
    const amount = useRef<HTMLInputElement>(null);
    const [amountError, setAmountError] = useState('');
    const [error, setError] = useState('');

    useEffect(() => { description.current?.focus(); }, []);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const service = values.get('servico');
        setError('');
        let value: number;
        try {
            value = cents(String(values.get('valor')));
        } catch (problem) {
            setAmountError((problem as Error).message);
            amount.current?.focus();
            return;
        }
        setAmountError('');
        try {
            await save({
                descricao: String(values.get('descricao')),
                detalhe: String(values.get('detalhe') || '') || null,
                valor: value,
                data: String(values.get('data')),
                servico: service ? Number(service) : null,
                pagamento: String(values.get('pagamento') || '') || null
            });
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Falha ao salvar.');
        }
    }

    return <form id="entry-form" onSubmit={submit} className="entry-form" aria-busy={busy}>
        <fieldset disabled={busy}>
            <legend>{selected ? 'Editar lançamento' : 'Novo lançamento'}</legend>
            <label>Descrição<input ref={description} name="descricao" required maxLength={180} defaultValue={selected?.descricao} /></label>
            {kind !== 'recebimentos' && <label>{kind === 'despesas' ? 'Categoria' : 'Cliente (opcional)'}
                <input name="detalhe" required={kind === 'despesas'} maxLength={120} defaultValue={selected?.detalhe ?? ''} />
            </label>}
            <div>
                <label>Valor (R$)<input ref={amount} name="valor" required inputMode="decimal"
                    aria-invalid={amountError ? true : undefined}
                    aria-describedby={amountError ? 'amount-error' : undefined}
                    onChange={() => setAmountError('')}
                    defaultValue={selected ? (selected.valor / 100).toFixed(2).replace('.', ',') : ''} /></label>
                <p id="amount-error" role="alert">{amountError}</p>
            </div>
            <label>{kind === 'despesas' ? 'Data da despesa' : kind === 'servicos' ? 'Data do serviço' : 'Data do recebimento'}
                <input type="date" name="data" required defaultValue={selected?.data} />
            </label>
            {kind !== 'servicos' && <label>Serviço
                <select name="servico" required={kind === 'recebimentos'} defaultValue={selected?.servico ?? ''}>
                    <option value="">{kind === 'despesas' ? 'Despesa geral' : 'Selecione'}</option>
                    {services.filter(service => !service.cancelado).map(service =>
                        <option key={service.id} value={service.id}>{service.descricao}</option>)}
                </select>
            </label>}
            {kind === 'despesas' && <label>Data do pagamento (opcional)
                <input type="date" name="pagamento" defaultValue={selected?.pagamento ?? ''} />
            </label>}
            <p role="alert">{error}</p>
            <div className="actions">
                <button type="submit">{busy ? 'Salvando…' : 'Salvar'}</button>
                <button type="button" onClick={close}>Fechar formulário</button>
            </div>
        </fieldset>
    </form>;
}

