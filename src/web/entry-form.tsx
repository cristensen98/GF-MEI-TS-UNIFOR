import { useRef, useState } from 'react';
import { cents, money } from './client.ts';
import { serviceTotal } from '../domain/model.ts';
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
    const amount = useRef<HTMLInputElement>(null);
    const [amountError, setAmountError] = useState('');
    const [error, setError] = useState('');
    const [baseText, setBaseText] = useState(selected ? (selected.valor / 100).toFixed(2).replace('.', ',') : '');
    const [materialText, setMaterialText] = useState(selected?.custoMaterial == null ? '' :
        (selected.custoMaterial / 100).toFixed(2).replace('.', ','));
    let preview = '—';
    if (kind === 'servicos' && baseText.trim()) {
        try {
            const total = serviceTotal({ valor: cents(baseText), custoMaterial: materialText.trim() ? cents(materialText, 0) : null });
            if (Number.isSafeInteger(total)) preview = money.format(total / 100);
        } catch {
            // Incomplete amounts are common while typing.
        }
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const service = values.get('servico');
        const material = String(values.get('custoMaterial') ?? '').trim();
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
                pagamento: String(values.get('pagamento') || '') || null,
                ...(kind === 'servicos' ? { custoMaterial: material ? cents(material, 0) : null } : {}),
                ...(kind === 'despesas' && !selected?.recorrenciaOrigem ? {
                    recorrente: values.has('recorrente')
                } : {})
            });
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Falha ao salvar.');
        }
    }

    return <form id="entry-form" onSubmit={submit} className="entry-form" aria-busy={busy}>
        <fieldset disabled={busy}>
            <label>Descrição<input data-initial-focus name="descricao" required maxLength={180} defaultValue={selected?.descricao} /></label>
            {kind !== 'recebimentos' && <label>{kind === 'despesas' ? 'Categoria' : 'Cliente (opcional)'}
                <input name="detalhe" required={kind === 'despesas'} maxLength={120} defaultValue={selected?.detalhe ?? ''} />
            </label>}
            <div className={kind === 'servicos' ? 'service-price-fields' : undefined}>
                <label>{kind === 'servicos' ? 'Valor do serviço (R$)' : 'Valor (R$)'}
                    <input ref={amount} id="service-base" name="valor" required inputMode="decimal"
                    aria-invalid={amountError ? true : undefined}
                    aria-describedby={amountError ? 'amount-error' : undefined}
                    onChange={event => { setAmountError(''); setBaseText(event.target.value); }}
                    value={baseText} /></label>
                <p id="amount-error" role="alert">{amountError}</p>
                {kind === 'servicos' && <>
                    <label>Custo de materiais (R$, opcional)
                        <input id="service-material" name="custoMaterial" inputMode="decimal" value={materialText}
                            onChange={event => setMaterialText(event.target.value)} />
                    </label>
                    <div className="service-price-total"><label htmlFor="service-total">Total do serviço</label>
                        <output id="service-total" htmlFor="service-base service-material">{preview}</output>
                    </div>
                </>}
            </div>
            <label>{kind === 'despesas' ? 'Data da despesa' : kind === 'servicos' ? 'Data do serviço' : 'Data do recebimento'}
                <input type="date" name="data" required defaultValue={selected?.data}
                    readOnly={Boolean(selected?.recorrente || selected?.recorrenciaOrigem)} />
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
            {kind === 'despesas' && !selected?.recorrenciaOrigem && <div className="recurrence-field">
                <label><input type="checkbox" name="recorrente" defaultChecked={selected?.recorrente}
                    aria-describedby="recurrence-hint" /> Repetir todo mês</label>
                <p id="recurrence-hint" className="muted">{selected?.recorrente
                    ? 'Desmarque para parar as próximas cobranças. Os lançamentos já gerados ficam no histórico.'
                    : 'Repete no dia da despesa. Em meses mais curtos, usa o último dia.'}</p>
            </div>}
            <p role="alert">{error}</p>
            <div className="actions">
                <button type="submit">{busy ? 'Salvando…' : 'Salvar'}</button>
                <button type="button" onClick={close}>Cancelar</button>
            </div>
        </fieldset>
    </form>;
}

