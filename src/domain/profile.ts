import { DomainError } from './model.ts';

export const profileFields = [
    { key: 'nomeExibicao', label: 'Nome de exibição', limit: 100, type: 'text' },
    { key: 'cnpj', label: 'CNPJ', limit: 18, type: 'text' },
    { key: 'razaoSocial', label: 'Razão social', limit: 160, type: 'text' },
    { key: 'email', label: 'E-mail', limit: 254, type: 'email' },
    { key: 'telefone', label: 'Telefone', limit: 40, type: 'tel' },
    { key: 'whatsapp', label: 'WhatsApp', limit: 40, type: 'tel' },
    { key: 'bio', label: 'Bio', limit: 1000, type: 'textarea' },
    { key: 'openingMonth', label: 'Mês e ano de abertura do MEI', limit: 7, type: 'month' }
] as const;

export const maxProfilePhotoBytes = 256 * 1024;
export const maxProfileCoverBytes = 512 * 1024;
export const profileRequestLimit = 1100 * 1024;
export const profilePhotoTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const profileImages = [
    { key: 'foto', label: 'foto', limit: maxProfilePhotoBytes },
    { key: 'capa', label: 'capa', limit: maxProfileCoverBytes }
] as const;
export type Profile = Partial<Record<(typeof profileFields)[number]['key'] | (typeof profileImages)[number]['key'], string>>;

function validImage(value: string, limit: number) {
    if (value.length > Math.ceil(limit / 3) * 4 + 32) return false;
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    try {
        const bytes = atob(match[2]);
        if (bytes.length > limit) return false;
        if (match[1] === 'jpeg') return bytes.startsWith('\xff\xd8\xff');
        if (match[1] === 'png') return bytes.startsWith('\x89PNG\r\n\x1a\n');
        return bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    } catch {
        return false;
    }
}

export function parseProfile(input: unknown): Profile {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new DomainError('Informe os dados do perfil.');
    }
    const fields = input as Record<string, unknown>;
    const profile: Profile = {};
    for (const { key, label, limit, type } of profileFields) {
        const value = fields[key];
        if (key === 'openingMonth') {
            if (value === undefined || value === '') continue;
            if (typeof value !== 'string' || value.length !== limit || !/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)) {
                throw new DomainError('Informe o mês e o ano de abertura do MEI no formato AAAA-MM.');
            }
            profile.openingMonth = value;
            continue;
        }
        if (typeof value !== 'string' || value.trim().length > limit) {
            throw new DomainError(`Informe um valor válido para ${label} (até ${limit} caracteres).`);
        }
        const trimmed = value.trim();
        if (type === 'email' && trimmed && !/^[^\s@]+@[^\s@]+$/.test(trimmed)) {
            throw new DomainError('Informe um e-mail válido.');
        }
        if (!trimmed) continue;
        if (key === 'cnpj') {
            const compact = trimmed.replace(/[.\/-]/g, '');
            const match = /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/i.exec(compact);
            const formatted = match && `${match[1]}.${match[2]}.${match[3]}/${match[4]}-${match[5]}`;
            if (!formatted || (trimmed !== compact && trimmed !== formatted)) {
                throw new DomainError('Informe um CNPJ com 14 caracteres, com números nas duas últimas posições.');
            }
            profile.cnpj = formatted.toUpperCase();
        } else {
            profile[key] = trimmed;
        }
    }
    for (const { key, label, limit } of profileImages) {
        const image = fields[key];
        if (image === undefined || image === '') continue;
        if (typeof image !== 'string' || !validImage(image, limit)) {
            throw new DomainError(`Para a ${label}, escolha uma imagem JPG, PNG ou WebP de até ${limit / 1024} KB.`);
        }
        profile[key] = image;
    }
    return profile;
}
