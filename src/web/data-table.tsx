import { Children, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

const pageSize = 20;

export function DataTable({ label, columns, targetRow = -1, children }: {
    label: string;
    columns: string[];
    targetRow?: number;
    children: ReactNode;
}) {
    const labelId = useId();
    const [page, setPage] = useState(0);
    const rows = Children.toArray(children);
    const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
    const targetPage = targetRow >= 0 ? Math.floor(targetRow / pageSize) : null;
    const currentPage = Math.min(targetPage ?? page, lastPage);
    const start = currentPage * pageSize;
    const end = Math.min(start + pageSize, rows.length);

    useEffect(() => {
        if (targetPage !== null || page > lastPage) setPage(currentPage);
    }, [currentPage, lastPage, page, targetPage]);

    return <>
        <div className="table-scroll" role="region" aria-labelledby={labelId} tabIndex={0}>
        <table className="data-table">
            <caption id={labelId} className="table-caption">{label}</caption>
            <thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
            <tbody>{rows.slice(start, end)}</tbody>
        </table>
        </div>
        {lastPage > 0 && <nav className="table-pagination" aria-label={`Paginação de ${label}`}>
            <p role="status">Mostrando {start + 1}–{end} de {rows.length} · Página {currentPage + 1} de {lastPage + 1}</p>
            <div className="actions">
                <button type="button" aria-disabled={currentPage === 0}
                    onClick={() => { if (currentPage > 0) setPage(currentPage - 1); }}>Anterior</button>
                <button type="button" aria-disabled={currentPage === lastPage}
                    onClick={() => { if (currentPage < lastPage) setPage(currentPage + 1); }}>Próxima</button>
            </div>
        </nav>}
    </>;
}
