const tones: Readonly<Record<string, string>> = {
    Aprovado: 'positive',
    Quitado: 'positive',
    Paga: 'positive',
    Recebido: 'positive',
    Pendente: 'pending',
    'A pagar': 'pending',
    Parcial: 'partial',
    'Em aberto': 'open',
    Cancelado: 'cancelled',
    Mensal: 'recurring'
};

export function StatusBadge({ status }: { status: string }) {
    return <span className="entry-status" data-tone={tones[status]}>{status}</span>;
}
