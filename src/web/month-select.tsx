import { useEffect, useId, useRef, useState } from 'react';

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
    month: 'short', year: 'numeric', timeZone: 'UTC'
});
const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });

export function monthLabel(month: string) {
    return monthFormatter.format(new Date(month + '-01T00:00:00Z'));
}

export function monthsOfYear(year: string) {
    return Array.from({ length: 12 }, (_, index) => year + '-' + String(index + 1).padStart(2, '0'));
}

export function MonthSelect({ label, year, value, onChange, onAnnual }: {
    label: string;
    year: string;
    value: string;
    onChange: (value: string) => void;
    onAnnual?: (year: string) => void;
}) {
    const labelId = useId();
    const valueId = useId();
    const calendar = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [yearInput, setYearInput] = useState(year);
    const validYear = /^(?!0000)[0-9]{4}$/.test(yearInput);
    const currentYear = new Date().getFullYear();
    const firstYear = Math.min(2009, Number(year));
    const lastYear = Math.max(currentYear + 10, Number(year));
    const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) =>
        String(lastYear - index).padStart(4, '0'));

    useEffect(() => {
        function dismissOutside(event: Event) {
            const panel = calendar.current;
            if (event.target instanceof Node && !panel?.contains(event.target)) setOpen(false);
        }
        document.addEventListener('pointerdown', dismissOutside);
        document.addEventListener('focusin', dismissOutside);
        return () => {
            document.removeEventListener('pointerdown', dismissOutside);
            document.removeEventListener('focusin', dismissOutside);
        };
    }, []);

    function close() {
        setOpen(false);
        trigger.current?.focus();
    }

    return <div className="month-select">
        <span id={labelId}>{label}</span>
        <div ref={calendar} className="month-calendar"
            onKeyDown={event => {
                if (event.key === 'Escape' && open) {
                    event.preventDefault();
                    close();
                }
            }}>
            <button type="button" ref={trigger} className="month-calendar-trigger" aria-labelledby={labelId + ' ' + valueId}
                aria-expanded={open} aria-controls={valueId + '-panel'}
                onClick={() => { if (!open) setYearInput(year); setOpen(!open); }}>
                <span id={valueId}>{value ? monthLabel(value) : 'Anual de ' + year}</span>
                <span className="month-calendar-icon" aria-hidden="true" />
            </button>
            {open && <div id={valueId + '-panel'} className="month-calendar-panel">
                <label>Ano
                    <select value={yearInput} onChange={event => setYearInput(event.target.value)}>
                        {years.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                </label>
                {validYear ? <>
                    <div className="month-calendar-grid" role="group" aria-label={'Meses de ' + yearInput}>
                        {monthsOfYear(yearInput).map(month => <button key={month} type="button"
                            aria-label={monthLabel(month)} aria-pressed={month === value}
                            onClick={() => { onChange(month); close(); }}>
                            {shortMonth.format(new Date(month + '-01T00:00:00Z')).replace(/\.$/, '')}
                        </button>)}
                    </div>
                    {onAnnual && <button type="button" aria-pressed={!value && year === yearInput}
                        onClick={() => { onAnnual(yearInput); close(); }}>Anual de {yearInput}</button>}
                </> : <p role="status">Informe um ano com quatro dígitos.</p>}
            </div>}
        </div>
    </div>;
}
