import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Router } from 'express';
import type { Request, Response } from 'express';

const cookieName = 'gfmei_session';
const lifetime = 60 * 60 * 8;
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

type Session = { usuario: string; administrador: boolean };
const validUsername = (name: string) => /^[a-z0-9._-]{3,32}$/i.test(name);
const validPassword = (password: unknown, confirmation: unknown): password is string =>
    typeof password === 'string' && password.length >= 12 && password.length <= 1024 && password === confirmation;

export function auth(databasePath: string) {
    const usuario = process.env.GFMEI_USER?.trim();
    const password = process.env.GFMEI_PASSWORD;
    const secret = process.env.GFMEI_JWT_SECRET;
    if (!usuario || Buffer.byteLength(usuario) > 128 || !password || password.length < 12 ||
        password.length > 1024 || !secret || Buffer.byteLength(secret) < 32) {
        throw new Error('Configure GFMEI_USER, GFMEI_PASSWORD (12 a 1024 caracteres) e GFMEI_JWT_SECRET (mínimo de 32 bytes).');
    }

    const db = new DatabaseSync(databasePath);
    db.exec(`
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS usuarios (
            usuario TEXT PRIMARY KEY COLLATE NOCASE,
            sal BLOB NOT NULL,
            senha BLOB NOT NULL,
            aprovado INTEGER NOT NULL DEFAULT 0 CHECK (aprovado IN (0, 1)),
            administrador INTEGER NOT NULL DEFAULT 0 CHECK (administrador IN (0, 1))
        ) STRICT;
    `);
    db.exec('BEGIN IMMEDIATE');
    try {
        if (!db.prepare('PRAGMA table_info(usuarios)').all().some(column => column.name === 'administrador')) {
            db.exec('ALTER TABLE usuarios ADD COLUMN administrador INTEGER NOT NULL DEFAULT 0 CHECK (administrador IN (0, 1))');
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    const router = Router();
    const adminLogin = usuario.toLowerCase();
    const salt = randomBytes(16);
    const passwordHash = scryptSync(password, salt, 32);
    const sessions = new Map<string, Session & { exp: number }>();
    const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, path: '/api' };
    const sign = (value: string) => createHmac('sha256', secret).update(value).digest('base64url');
    const now = () => Math.floor(Date.now() / 1000);
    let attempts = 0;
    let retryAt = 0;
    let registrations = 0;
    let registrationWindowEnd = 0;

    function sessionId(cookie: string | undefined) {
        const token = cookie?.split(/;\s*/).find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
        const [tokenHeader, payload, signature, extra] = token?.split('.') ?? [];
        if (tokenHeader !== header || !payload || !signature || extra !== undefined ||
            !/^[\w-]{43}$/.test(signature) || payload.length > 1024) return undefined;
        const expected = sign(header + '.' + payload);
        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return undefined;
        try {
            const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
            const session = sessions.get(claims.jti);
            if (session && session.usuario === claims.sub && session.exp === claims.exp && session.exp > now()) {
                return claims.jti as string;
            }
        } catch {
            return undefined;
        }
    }

    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        const origin = req.get('Origin');
        if (req.method !== 'GET' && req.method !== 'HEAD' && origin &&
            origin !== req.protocol + '://' + req.get('Host')) {
            res.status(403).json({ erro: 'Origem da solicitação inválida.' });
            return;
        }
        next();
    });

    function createAccount(req: Request, res: Response, approved: boolean) {
        const { usuario: name, senha, confirmacao } = req.body ?? {};
        const login = typeof name === 'string' ? name.trim() : '';
        if (!validUsername(login) || !validPassword(senha, confirmacao)) {
            res.status(400).json({ erro: 'Use 3 a 32 letras sem acento, números, ponto, hífen ou sublinhado no usuário e confirme uma senha de 12 a 1024 caracteres.' });
            return;
        }
        const userSalt = randomBytes(16);
        const hash = scryptSync(senha, userSalt, 32);
        const created = login.toLowerCase() !== adminLogin && db.prepare(
            'INSERT INTO usuarios (usuario, sal, senha, aprovado) VALUES (?, ?, ?, ?) ON CONFLICT(usuario) DO NOTHING'
        ).run(login, userSalt, hash, approved ? 1 : 0).changes;
        if (!created) {
            res.status(409).json({ erro: 'Esse nome de usuário já está em uso.' });
            return;
        }
        res.status(201).json({ usuario: login, aprovado: approved, administrador: false });
    }

    router.post('/auth/register', (req, res) => {
        const time = now();
        if (time >= registrationWindowEnd) {
            registrations = 0;
            registrationWindowEnd = time + 60;
        }
        if (registrations >= 5) {
            res.set('Retry-After', String(registrationWindowEnd - time));
            res.status(429).json({ erro: 'Muitas tentativas de cadastro. Aguarde um minuto.' });
            return;
        }
        registrations++;
        createAccount(req, res, false);
    });

    router.post('/auth/login', (req, res) => {
        const time = now();
        if (time >= retryAt) {
            attempts = 0;
            retryAt = time + 60;
        }
        if (attempts >= 8) {
            res.set('Retry-After', String(retryAt - time));
            res.status(429).json({ erro: 'Muitas tentativas. Aguarde um minuto.' });
            return;
        }
        attempts++;
        const { usuario: name, senha } = req.body ?? {};
        const login = typeof name === 'string' ? name.trim() : '';
        const bootstrapAdmin = login.toLowerCase() === adminLogin;
        const account = bootstrapAdmin ? undefined : db.prepare(
            'SELECT usuario, sal, senha, aprovado, administrador FROM usuarios WHERE usuario = ?'
        ).get(login);
        const candidateSalt = account ? account.sal as Uint8Array : salt;
        const candidateHash = account ? account.senha as Uint8Array : passwordHash;
        if (typeof senha !== 'string' || senha.length > 1024 ||
            !timingSafeEqual(scryptSync(senha, candidateSalt, 32), candidateHash) || (!bootstrapAdmin && !account)) {
            res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
            return;
        }
        if (account && account.aprovado !== 1) {
            res.status(403).json({ erro: 'Sua conta ainda aguarda aprovação do administrador.' });
            return;
        }
        attempts = 0;
        for (const [id, session] of sessions) if (session.exp <= time) sessions.delete(id);
        const oldSession = sessionId(req.get('Cookie'));
        if (oldSession) sessions.delete(oldSession);
        const jti = randomBytes(16).toString('hex');
        const exp = time + lifetime;
        const session = {
            usuario: account ? String(account.usuario) : usuario,
            administrador: bootstrapAdmin || account?.administrador === 1
        };
        sessions.set(jti, { ...session, exp });
        const payload = Buffer.from(JSON.stringify({ sub: session.usuario, jti, iat: time, exp })).toString('base64url');
        const unsigned = header + '.' + payload;
        res.cookie(cookieName, unsigned + '.' + sign(unsigned), { ...cookieOptions, maxAge: lifetime * 1000 });
        res.json(session);
    });

    router.post('/auth/logout', (req, res) => {
        const id = sessionId(req.get('Cookie'));
        if (id) sessions.delete(id);
        res.clearCookie(cookieName, cookieOptions).sendStatus(204);
    });

    router.get('/auth/session', (req, res) => {
        const id = sessionId(req.get('Cookie'));
        const session = id ? sessions.get(id) : undefined;
        res.json(session ? { usuario: session.usuario, administrador: session.administrador } : null);
    });
    router.use((req, res, next) => {
        const id = sessionId(req.get('Cookie'));
        if (!id) {
            res.status(401).json({ erro: 'Entre para acessar o GF-MEI.' });
            return;
        }
        res.locals.session = sessions.get(id);
        next();
    });
    router.use('/auth/accounts', (_req, res, next) => {
        if (res.locals.session?.administrador) next();
        else res.status(403).json({ erro: 'Apenas o administrador pode gerenciar usuários.' });
    });
    router.get('/auth/accounts', (_req, res) => {
        const accounts = db.prepare('SELECT usuario, aprovado, administrador FROM usuarios WHERE usuario <> ? ORDER BY aprovado, usuario')
            .all(usuario)
            .map(account => ({ usuario: account.usuario, aprovado: account.aprovado === 1,
                administrador: account.administrador === 1 }));
        res.json([{ usuario, aprovado: true, administrador: true, contaInstalacao: true }, ...accounts]);
    });
    router.post('/auth/accounts', (req, res) => { createAccount(req, res, true); });
    router.put('/auth/accounts/:usuario', (req, res) => {
        const previous = req.params.usuario.toLowerCase();
        const { usuario: name, administrador, senha, confirmacao } = req.body ?? {};
        const login = typeof name === 'string' ? name.trim() : '';
        const changePassword = (senha !== undefined && senha !== '') || (confirmacao !== undefined && confirmacao !== '');
        if (previous === adminLogin) {
            res.status(403).json({ erro: 'A conta administradora da instalação é configurada no servidor.' });
            return;
        }
        if (!validUsername(login) || typeof administrador !== 'boolean' ||
            (changePassword && !validPassword(senha, confirmacao))) {
            res.status(400).json({ erro: 'Informe um nome de usuário e um perfil válidos. Para trocar a senha, confirme uma senha de 12 a 1024 caracteres.' });
            return;
        }
        if (login.toLowerCase() === adminLogin) {
            res.status(409).json({ erro: 'Esse nome de usuário já está em uso.' });
            return;
        }
        if (!db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(previous)) {
            res.status(404).json({ erro: 'Conta não encontrada.' });
            return;
        }
        const newSalt = changePassword ? randomBytes(16) : null;
        const hash = newSalt ? scryptSync(senha, newSalt, 32) : null;
        const account = db.prepare(`
            UPDATE OR IGNORE usuarios SET usuario = ?, administrador = ?,
                sal = COALESCE(?, sal), senha = COALESCE(?, senha)
            WHERE usuario = ? RETURNING usuario, aprovado
        `).get(login, administrador ? 1 : 0, newSalt, hash, previous);
        if (!account) {
            res.status(409).json({ erro: 'Esse nome de usuário já está em uso.' });
            return;
        }
        for (const [id, session] of sessions) {
            if (session.usuario.toLowerCase() === previous) sessions.delete(id);
        }
        if (res.locals.session.usuario.toLowerCase() === previous) res.clearCookie(cookieName, cookieOptions);
        res.json({ usuario: account.usuario, aprovado: account.aprovado === 1, administrador });
    });
    router.post('/auth/accounts/:usuario/approve', (req, res) => {
        const result = db.prepare('UPDATE usuarios SET aprovado = 1 WHERE usuario = ?').run(req.params.usuario);
        if (!result.changes) res.status(404).json({ erro: 'Conta não encontrada.' });
        else res.sendStatus(204);
    });
    return router;
}
