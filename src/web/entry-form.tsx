import { cents } from './client.ts';
import type { Draft, Entry, Kind } from '../domain/model.ts';
import type { FormEvent } from 'react';

interface Props {
    kind: Kind;
    selected: Entry | null;
    services: Entry[];
    save: (draft: Draft) => Promise<void>;
    stop: () => void;
    reportError: (message: string) => void;
    busy: boolean;
}

export function EntryForm({ kind, selected, services, save, stop, reportError, busy }: Props) {
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const service = values.get('servico');
        try {
            await save({
                descricao: String(values.get('descricao')),
                detalhe: String(values.get('detalhe') || '') || null,
                valor: cents(String(values.get('valor'))),
                data: String(values.get('data')),
                servico: service ? Number(service) : null,
                pagamento: String(values.get('pagamento') || '') || null
            });
            form.reset();
        } catch (error) {
            reportError(error instanceof Error ? error.message : 'Falha ao salvar.');
        }
    }

    return <form onSubmit={submit}>
        <fieldset disabled={busy}>
            <legend>{selected ? 'Editar lançamento' : 'Novo lançamento'}</legend>
            <label>Descrição<input name="descricao" required maxLength={180} defaultValue={selected?.descricao} /></label>
            {kind !== 'recebimentos' && <label>{kind === 'despesas' ? 'Categoria' : 'Cliente (opcional)'}
                <input name="detalhe" required={kind === 'despesas'} maxLength={120} defaultValue={selected?.detalhe ?? ''} />
            </label>}
            <label>Valor (R$)<input name="valor" required inputMode="decimal"
                defaultValue={selected ? (selected.valor / 100).toFixed(2).replace('.', ',') : ''} /></label>
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
            <div className="actions">
                <button type="submit">Salvar</button>
                {selected && <button type="button" onClick={stop}>Sair da edição</button>}
            </div>
        </fieldset>
    </form>;
}

