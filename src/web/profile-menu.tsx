import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, MouseEvent, ReactNode } from 'react';
import { profileFields, profileImages, profilePhotoTypes } from '../domain/profile.ts';
import type { Profile } from '../domain/profile.ts';
import { request } from './client.ts';
import { Modal } from './modal.tsx';
import { PasswordDialog } from './password-dialog.tsx';
import { setTheme } from './theme.ts';
import type { Theme } from './theme.ts';

type Field = (typeof profileFields)[number];
type ImageKey = (typeof profileImages)[number]['key'];
const images = profileImages.map(image => ({
    ...image, label: image.key === 'foto' ? 'Foto de perfil' : 'Capa do perfil'
}));

const [nameField, cnpjField, companyField, emailField, phoneField, whatsappField, bioField, openingMonthField] = profileFields;
const profileGroups = [
    { title: 'Dados do MEI', fields: [cnpjField, companyField, openingMonthField] },
    { title: 'Contato', fields: [emailField, phoneField, whatsappField] }
];

function fieldValue(profile: Profile, { key }: Field) {
    const value = profile[key];
    if (key !== 'openingMonth' || !value) return value;
    return `${value.slice(5)}/${value.slice(0, 4)}`;
}

function Avatar({ source, name }: { source?: string; name: string }) {
    return <span className="user-avatar" aria-hidden="true">
        {source ? <img src={source} alt="" /> : Array.from(name)[0]?.toLocaleUpperCase('pt-BR')}
    </span>;
}

function ImageControl({ image, present, busy, select, remove }: {
    image: (typeof images)[number];
    present: boolean;
    busy: boolean;
    select: (file: File) => void;
    remove: () => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const control = useRef<HTMLDivElement>(null);
    const id = useId();
    const [open, setOpen] = useState(false);
    const isPhoto = image.key === 'foto';
    const label = `${present ? 'Editar' : 'Adicionar'} ${image.label.toLocaleLowerCase('pt-BR')}`;

    useEffect(() => {
        if (!open) return;
        function dismiss(event: PointerEvent) {
            if (event.target instanceof Node && !control.current?.contains(event.target)) setOpen(false);
        }
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);

    function choose() {
        setOpen(false);
        trigger.current?.focus();
        input.current?.click();
    }

    return <div ref={control} className={`profile-image-control profile-image-control--${image.key}`}
        onBlur={event => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
        onKeyDown={event => {
            if (open && event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                trigger.current?.focus();
            }
        }}>
        <input ref={input} type="file" accept={profilePhotoTypes.join(',')} aria-label={image.label}
            hidden disabled={busy} onChange={event => {
                const file = event.currentTarget.files?.[0];
                if (file) select(file);
                event.currentTarget.value = '';
            }} />
        <button ref={trigger} type="button" className="profile-image-trigger" aria-label={label} title={label}
            aria-expanded={present ? open : undefined} aria-controls={open ? id : undefined}
            aria-disabled={busy || undefined} onClick={() => {
                if (busy) return;
                if (present) setOpen(value => !value);
                else choose();
            }}>
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isPhoto
                    ? <><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="3" /></>
                    : <path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4" />}
            </svg>
        </button>
        {open && <div className="profile-image-options" id={id}>
            <button type="button" onClick={choose}>{isPhoto ? 'Trocar foto' : 'Trocar capa'}</button>
            <button type="button" className="danger" onClick={() => {
                setOpen(false);
                remove();
                trigger.current?.focus();
            }}>{isPhoto ? 'Remover foto' : 'Remover capa'}</button>
        </div>}
    </div>;
}

function ProfileHero({ profile, displayName, edit, showName, photoControl, coverControl }: {
    profile: Profile;
    displayName: string;
    edit?: () => void;
    showName?: (event: MouseEvent<HTMLButtonElement>) => void;
    photoControl?: ReactNode;
    coverControl?: ReactNode;
}) {
    return <div className="profile-hero">
        <div className="profile-cover">
            {profile.capa && <img src={profile.capa} alt="" />}
            {coverControl}
        </div>
        <div className="profile-identity">
            <div className="profile-avatar-wrap">
                <Avatar source={profile.foto} name={displayName} />
                {photoControl}
            </div>
            {edit && <button type="button" className="profile-edit-action" onClick={edit}>Editar perfil</button>}
            <h3>{showName
                ? <button type="button" className="profile-display-name" onClick={showName}>{displayName}</button>
                : displayName}</h3>
        </div>
    </div>;
}

export function ProfileMenu({ username, exit, exiting, busy, onOpeningMonthChange }: {
    username: string;
    exit: () => void;
    exiting: boolean;
    busy: boolean;
    onOpeningMonthChange: (openingMonth: string | undefined) => void;
}) {
    const trigger = useRef<HTMLButtonElement>(null);
    const fieldTrigger = useRef<HTMLButtonElement>(null);
    const menuId = useId();
    const [open, setOpen] = useState(false);
    const [theme, updateTheme] = useState<Theme>(() =>
        document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    const [dialog, setDialog] = useState<'profile' | 'edit' | null>(null);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [field, setField] = useState<Field | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loadError, setLoadError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);
    const [imageDraft, setImageDraft] = useState<Partial<Record<ImageKey, string>>>({});
    const [imageError, setImageError] = useState<{ key: ImageKey; message: string } | null>(null);
    const [readingImage, setReadingImage] = useState<ImageKey | null>(null);
    const [retry, setRetry] = useState(0);
    const displayName = profile?.nomeExibicao || username;
    const preview = { ...profile, ...imageDraft };
    const updating = saving || readingImage !== null;

    useEffect(() => {
        let active = true;
        void request<Profile>('auth/profile').then(result => {
            if (!active) return;
            setProfile(result);
            onOpeningMonthChange(result.openingMonth);
        })
            .catch(error => { if (active) setLoadError((error as Error).message); });
        return () => { active = false; };
    }, [onOpeningMonthChange, retry]);

    function show(next: 'profile' | 'edit') {
        setOpen(false);
        setField(null);
        setSaveError('');
        setImageError(null);
        setImageDraft({});
        setDialog(next);
    }

    function showField(item: Field, event: MouseEvent<HTMLButtonElement>) {
        fieldTrigger.current = event.currentTarget;
        setField(item);
    }

    function closeField() {
        setField(null);
        requestAnimationFrame(() => fieldTrigger.current?.focus());
    }

    function selectImage(file: File, key: ImageKey, limit: number) {
        setImageError(null);
        if (!profilePhotoTypes.includes(file.type) || file.size > limit) {
            setImageError({ key, message: 'Escolha uma imagem JPG, PNG ou WebP de até ' + limit / 1024 + ' KB.' });
            return;
        }
        setReadingImage(key);
        const reader = new FileReader();
        function readError() {
            setImageError({ key, message: 'Não foi possível abrir a imagem.' });
            setReadingImage(null);
        }
        reader.onerror = reader.onabort = readError;
        reader.onload = async () => {
            try {
                const image = new Image();
                const source = String(reader.result);
                image.src = source;
                await image.decode();
                setImageDraft(draft => ({ ...draft, [key]: source }));
                setReadingImage(null);
            } catch {
                readError();
            }
        };
        reader.readAsDataURL(file);
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (updating) return;
        const data = Object.fromEntries(new FormData(event.currentTarget));
        setSaveError('');
        setSaving(true);
        try {
            const result = await request<Profile>('auth/profile', 'PUT', { ...data, ...imageDraft });
            setProfile(result);
            onOpeningMonthChange(result.openingMonth);
            show('profile');
        } catch (error) {
            setSaveError((error as Error).message);
        } finally {
            setSaving(false);
        }
    }

    function imageControl(image: (typeof images)[number]) {
        const { key, limit } = image;
        return <ImageControl image={image} present={Boolean(preview[key])} busy={updating}
            select={file => selectImage(file, key, limit)} remove={() => {
                setImageDraft(draft => ({ ...draft, [key]: '' }));
                setImageError(null);
            }} />;
    }

    return <div className="profile-menu" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
        if (open && event.key === 'Escape') {
            setOpen(false);
            trigger.current?.focus();
        }
    }}>
        <button type="button" ref={trigger} className="workspace-user" aria-expanded={open}
            aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>
            <Avatar source={profile?.foto} name={displayName} />
            <strong>{displayName}</strong><span aria-hidden="true">▾</span>
        </button>
        {open && <div id={menuId} className="profile-options">
            <button type="button" aria-haspopup="dialog" onClick={() => show('profile')}>Meu perfil</button>
            <button type="button" aria-haspopup="dialog" onClick={() => show('edit')}>Editar perfil</button>
            <button type="button" aria-haspopup="dialog" onClick={() => {
                setOpen(false);
                setPasswordOpen(true);
            }}>Alterar senha</button>
            <div className="profile-theme">
                <button type="button" className="profile-theme-switch" role="switch" aria-checked={theme === 'dark'}
                    onClick={() => {
                        const nextTheme = theme === 'dark' ? 'light' : 'dark';
                        setTheme(nextTheme);
                        updateTheme(nextTheme);
                    }}>
                    <span lang="en">Dark mode</span>
                    <span className="profile-theme-track" aria-hidden="true" />
                </button>
            </div>
            <button type="button" disabled={busy || exiting} onClick={() => { setOpen(false); exit(); }}>
                {exiting ? 'Saindo…' : 'Sair'}
            </button>
        </div>}
        {passwordOpen && <PasswordDialog trigger={trigger.current} close={() => setPasswordOpen(false)} />}
        {dialog && <Modal title={dialog === 'edit' ? 'Editar perfil' : field?.label ?? 'Meu perfil'}
            className={field ? 'profile-detail-modal' : 'profile-modal'}
            trigger={trigger.current} busy={updating} close={() => setDialog(null)}>
            {!profile ? (loadError ? <>
                <p role="alert">{loadError}</p>
                <button type="button" onClick={() => { setLoadError(''); setRetry(value => value + 1); }}>Tentar novamente</button>
            </> : <p role="status">Carregando perfil…</p>) : dialog === 'edit' ?
                <form className="profile-form" onSubmit={save} aria-busy={updating}>
                    <ProfileHero profile={preview} displayName={displayName}
                        photoControl={imageControl(images[0])} coverControl={imageControl(images[1])} />
                    <p role="status">{readingImage ? 'Preparando prévia…' : ''}</p>
                    <p role="alert">{imageError && `${imageError.key === 'foto' ? 'Foto de perfil' : 'Capa'} · ${imageError.message}`}</p>
                    <div className="profile-edit-fields">
                        {profileFields.map(({ key, label, limit, type }) => <label key={key}
                            className={type === 'textarea' ? 'profile-edit-bio' : undefined}>
                            {label}{type === 'month' && ' (opcional)'}
                            {type === 'textarea'
                                ? <textarea name={key} maxLength={limit} defaultValue={profile[key]} rows={4} readOnly={saving} />
                                : <input name={key} type={type} maxLength={type === 'month' ? undefined : limit}
                                    defaultValue={profile[key] ?? ''}
                                    placeholder={key === 'cnpj' ? '00.000.000/0000-00' : type === 'month' ? 'AAAA-MM' : undefined}
                                    readOnly={saving} />}
                        </label>)}
                    </div>
                    <p role="alert">{saveError}</p>
                    <div className="actions profile-form-actions">
                        <button type="button" disabled={updating} onClick={() => show('profile')}>Cancelar</button>
                        <button className="primary" type="submit" disabled={updating}>{saving ? 'Salvando…' : 'Salvar perfil'}</button>
                    </div>
                </form> : <>
                    {field && <div className="profile-field-detail">
                        <p>{fieldValue(profile, field) || (field.key === 'nomeExibicao' ? displayName : 'Não informado')}</p>
                        <button type="button" onClick={closeField}>Voltar ao perfil</button>
                    </div>}
                    <div hidden={Boolean(field)}>
                        <ProfileHero profile={profile} displayName={displayName} edit={() => show('edit')}
                            showName={event => showField(nameField, event)} />
                        <div className="profile-overview">
                            <section className="profile-bio" aria-labelledby="profile-bio-heading">
                                <h4 id="profile-bio-heading">Bio</h4>
                                <button type="button" onClick={event => showField(bioField, event)}>
                                    {profile.bio || 'Nenhuma biografia adicionada.'}
                                </button>
                            </section>
                            <div className="profile-groups">
                                {profileGroups.map(group => <section className="profile-group" key={group.title}>
                                    <h4>{group.title}</h4>
                                    <ul role="list">{group.fields.map(item => <li key={item.key}>
                                        <button type="button" onClick={event => showField(item, event)}>
                                            <span>{item.label}</span>
                                            <strong>{fieldValue(profile, item) || 'Não informado'}</strong>
                                        </button>
                                    </li>)}</ul>
                                </section>)}
                            </div>
                        </div>
                    </div>
                </>}
        </Modal>}
    </div>;
}
