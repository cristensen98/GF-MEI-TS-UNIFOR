import { useId, useState } from 'react';

export function PasswordField({ name, label, creating, busy, initialFocus = false, invalid, describedBy }: {
    name: string;
    label: string;
    creating: boolean;
    busy: boolean;
    initialFocus?: boolean;
    invalid?: boolean;
    describedBy?: string;
}) {
    const [visible, setVisible] = useState(false);
    const id = useId();
    return <div className="password-field">
        <label htmlFor={id}>{label}</label>
        <div className="password-control">
            <input id={id} name={name} type={visible ? 'text' : 'password'}
                autoComplete={creating ? 'new-password' : 'current-password'}
                required readOnly={busy} minLength={creating ? 12 : undefined} maxLength={1024}
                data-initial-focus={initialFocus || undefined}
                aria-invalid={invalid || undefined} aria-describedby={describedBy}
                autoCapitalize="none" spellCheck={false} />
            <button type="button" aria-label={(visible ? 'Ocultar ' : 'Mostrar ') + label.toLowerCase()}
                aria-controls={id} onClick={() => setVisible(current => !current)}>
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
