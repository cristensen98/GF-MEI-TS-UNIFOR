import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { request } from './client.ts';
import { Modal } from './modal.tsx';
import { PasswordField } from './password-field.tsx';

export function PasswordDialog({ trigger, close }: { trigger: HTMLElement | null; close: () => void }) {
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [confirmationInvalid, setConfirmationInvalid] = useState(false);
    const hintId = useId();
    const errorId = useId();

    async function changePassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        if (values.novaSenha !== values.confirmacao) {
            setError('A confirmação precisa ser igual à nova senha.');
            setConfirmationInvalid(true);
            (form.elements.namedItem('confirmacao') as HTMLInputElement | null)?.focus();
            return;
        }
        setBusy(true);
        setError('');
        setConfirmationInvalid(false);
        try {
            await request('auth/password', 'PUT', values);
            form.reset();
            setSaved(true);
        } catch (problem) {
            setError((problem as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return <Modal title="Alterar senha" trigger={trigger} close={close} busy={busy} className="profile-detail-modal">
        {saved ? <div className="login-form">
            <p role="status">Senha alterada. Use a nova senha no próximo acesso.</p>
            <button type="button" className="primary" autoFocus onClick={close}>Concluir</button>
        </div> : <form className="login-form" onSubmit={changePassword} aria-busy={busy}
            onInput={event => {
                if (confirmationInvalid && event.target instanceof HTMLInputElement &&
                    (event.target.name === 'novaSenha' || event.target.name === 'confirmacao')) {
                    setConfirmationInvalid(false);
                    setError('');
                }
            }}>
            <PasswordField name="senhaAtual" label="Senha atual" creating={false} busy={busy} initialFocus />
            <PasswordField name="novaSenha" label="Nova senha" creating busy={busy} describedBy={hintId} />
            <PasswordField name="confirmacao" label="Confirmar nova senha" creating busy={busy}
                invalid={confirmationInvalid} describedBy={confirmationInvalid ? errorId : undefined} />
            <p id={hintId} className="muted">Use pelo menos 12 caracteres na nova senha.</p>
            <p id={errorId} role="alert">{error}</p>
            <div className="actions profile-form-actions">
                <button type="button" onClick={close} disabled={busy}>Cancelar</button>
                <button type="submit" className="primary" aria-disabled={busy || undefined}>
                    {busy ? 'Alterando…' : 'Alterar senha'}
                </button>
            </div>
        </form>}
    </Modal>;
}
