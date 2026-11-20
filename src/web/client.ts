export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch('/api/' + path, {
        method,
        ...(body === undefined ? {} : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    });
    if (!response.ok) {
        const error = await response.json().catch(() => null);
        if (response.status === 401 && path !== 'auth/login') {
            window.dispatchEvent(new Event('gfmei:session-ended'));
        }
        throw new Error(error?.erro ?? 'Não foi possível concluir a solicitação.');
    }
    return response.status === 204 ? undefined as T : response.json();
}

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function cents(value: string, minimum = 1) {
    const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim());
    if (!match) throw new Error('Informe um valor com até duas casas decimais.');
    const result = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
    if (!Number.isSafeInteger(result) || result < minimum) throw new Error('Informe um valor válido.');
    return result;
}

