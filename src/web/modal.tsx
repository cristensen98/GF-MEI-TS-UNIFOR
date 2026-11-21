import { useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Modal({ title, trigger, close, busy = false, className = '', children }: {
    title: string;
    trigger: HTMLElement | null;
    close: () => void;
    busy?: boolean;
    className?: string;
    children: ReactNode;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const headingId = useId();

    useLayoutEffect(() => {
        const element = dialog.current!;
        element.showModal();
        return () => {
            element.close();
            requestAnimationFrame(() => trigger?.focus());
        };
    }, [trigger]);

    useLayoutEffect(() => {
        const initial = dialog.current?.querySelector<HTMLElement>('[data-initial-focus]');
        (initial ?? heading.current)?.focus();
    }, [title, trigger]);

    return <dialog ref={dialog} className={`modal ${className}`} aria-labelledby={headingId} onCancel={event => {
        event.preventDefault();
        if (!busy) close();
    }}>
        <div className="modal-header">
            <h2 ref={heading} id={headingId} tabIndex={-1}>{title}</h2>
            <button type="button" disabled={busy} onClick={close}>Fechar</button>
        </div>
        {children}
    </dialog>;
}
