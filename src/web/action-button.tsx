import type { ComponentPropsWithoutRef } from 'react';

const paths = {
    view: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm13 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',
    edit: 'm4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4',
    approve: 'm5 12 4 4L19 6',
    cancel: 'm6 6 12 12M18 6 6 18',
    pending: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
};

export function ActionButton({ icon, label, ...props }: ComponentPropsWithoutRef<'button'> & {
    icon: keyof typeof paths;
    label: string;
}) {
    return <button {...props} type="button" className="table-action" data-action={icon} aria-label={label} title={label}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={paths[icon]} />
        </svg>
    </button>;
}
