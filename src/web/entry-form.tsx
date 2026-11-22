import { useRef, useState } from 'react';
import { amountInput, cents, formatMoney } from './client.ts';
import { expenseCategories, serviceTotal } from '../domain/model.ts';
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
    const materialAmount = useRef<HTMLInputElement>(null);
    const [amountError, setAmountError] = useState('');
    const [materialError, setMaterialError] = useState('');
    const [error, setError] = useState('');
    const [paid, setPaid] = useState(Boolean(selected?.pagamento));
    const [baseText, setBaseText] = useState(selected ? amountInput(selected.valor) : '');
    const [materialText, setMaterialText] = useState(selected?.custoMaterial == null ? '' : amountInput(selected.custoMaterial));
    let preview = '—';
    if (kind === 'servicos' && baseText.trim()) {
        try {
            const total = serviceTotal({ valor: cents(baseText), custoMaterial: materialText.trim() ? cents(materialText, 0) : null });
            if (Number.isSafeInteger(total)) preview = formatMoney(total);
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
        let materialCents: number | null = null;
        if (kind === 'servicos' && material) {
            try {
                materialCents = cents(material, 0);
            } catch (problem) {
                setMaterialError((problem as Error).message);
                materialAmount.current?.focus();
                return;
            }
        }
        setMaterialError('');
        try {
            await save({
                descricao: String(values.get('descricao')),
                cancelado: values.get('situacaoCadastro') === 'cancelado',
                detalhe: String(values.get('detalhe') || '') || null,
                valor: value,
                data: String(values.get('data')),
                servico: service ? Number(service) : null,
                pagamento: String(values.get('pagamento') || '') || null,
                ...(kind === 'servicos' ? { custoMaterial: materialCents } : {}),
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
            <label>Status do lançamento
                <select name="situacaoCadastro" defaultValue={selected?.cancelado ? 'cancelado' : 'ativo'}>
                    <option value="ativo">Ativo</option>
                    <option value="cancelado">Cancelado</option>
                </select>
            </label>
            {kind === 'despesas' && <label>Categoria
                <select name="detalhe" required defaultValue={selected?.detalhe ?? ''}>
                    <option value="">Selecione uma categoria</option>
                    {selected?.detalhe && !expenseCategories.includes(selected.detalhe) &&
                        <option value={selected.detalhe}>{selected.detalhe} (categoria anterior)</option>}
                    {expenseCategories.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
            </label>}
            {kind === 'servicos' && <label>Cliente (opcional)
                <input name="detalhe" maxLength={120} defaultValue={selected?.detalhe ?? ''} />
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
                        <input ref={materialAmount} id="service-material" name="custoMaterial" inputMode="decimal" value={materialText}
                            aria-invalid={materialError ? true : undefined}
                            aria-describedby={materialError ? 'material-error' : undefined}
                            onChange={event => { setMaterialError(''); setMaterialText(event.target.value); }} />
                    </label>
                    <p id="material-error" role="alert">{materialError}</p>
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
                    {services.filter(service => !service.cancelado || service.id === selected?.servico).map(service =>
                        <option key={service.id} value={service.id}>{service.descricao}</option>)}
                </select>
            </label>}
            {kind === 'despesas' && <>
                <label>Situação
                    <select value={paid ? 'paga' : 'aberta'} onChange={event => setPaid(event.target.value === 'paga')}>
                        <option value="aberta">A pagar</option>
                        <option value="paga">Paga</option>
                    </select>
                </label>
                {paid && <label>Data do pagamento
                    <input type="date" name="pagamento" required defaultValue={selected?.pagamento ?? ''} />
                </label>}
            </>}
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

