import { useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Modal({ title, trigger, close, busy = false, children }: {
    title: string;
    trigger: HTMLElement | null;
    close: () => void;
    busy?: boolean;
    children: ReactNode;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const headingId = useId();

    useLayoutEffect(() => {
        const element = dialog.current!;
        element.showModal();
        element.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
        return () => {
            element.close();
            requestAnimationFrame(() => trigger?.focus());
        };
    }, [trigger]);

    return <dialog ref={dialog} className="modal" aria-labelledby={headingId} onCancel={event => {
        event.preventDefault();
        if (!busy) close();
    }}>
        <div className="modal-header">
            <h2 id={headingId}>{title}</h2>
            <button type="button" disabled={busy} onClick={close}>Fechar</button>
        </div>
        {children}
    </dialog>;
}
