import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { json, Router } from 'express';
import type { Request, Response } from 'express';
import { parseProfile, profileImages, profileRequestLimit } from '../domain/profile.ts';
import { apiJsonLimit } from './http.ts';

const cookieName = 'gfmei_session';
const lifetime = 60 * 60 * 8;
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

type Session = { usuario: string; administrador: boolean; workspace: string };
type Credential = { sal: Uint8Array; senha: Uint8Array };
type Attempts = Map<string, { count: number; end: number }>;
const readJson = json({ limit: apiJsonLimit, inflate: false });
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
        CREATE TABLE IF NOT EXISTS perfis (
            workspace TEXT PRIMARY KEY NOT NULL,
            dados TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS credenciais_instalacao (
            usuario TEXT PRIMARY KEY NOT NULL,
            sal BLOB NOT NULL,
            senha BLOB NOT NULL
        ) STRICT;
    `);
    db.exec('BEGIN IMMEDIATE');
    try {
        const columns = db.prepare('PRAGMA table_info(usuarios)').all();
        if (!columns.some(column => column.name === 'administrador')) {
            db.exec('ALTER TABLE usuarios ADD COLUMN administrador INTEGER NOT NULL DEFAULT 0 CHECK (administrador IN (0, 1))');
        }
        if (!columns.some(column => column.name === 'workspace')) {
            db.exec(`ALTER TABLE usuarios ADD COLUMN workspace TEXT;
                CREATE UNIQUE INDEX usuarios_workspace ON usuarios(workspace);`);
        }
        db.exec('UPDATE usuarios SET workspace = lower(hex(randomblob(16))) WHERE workspace IS NULL');
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    const router = Router();
    const adminLogin = usuario.toLowerCase();
    const salt = randomBytes(16);
    const passwordHash = scryptSync(password, salt, 32);
    const initialCredential = { sal: salt, senha: passwordHash };
    const installationCredential = db.prepare('SELECT sal, senha FROM credenciais_instalacao WHERE usuario = ?');
    const sessions = new Map<string, Session & { exp: number }>();
    const loginAttempts: Attempts = new Map();
    const passwordAttempts: Attempts = new Map();
    const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, path: '/api' };
    const sign = (value: string) => createHmac('sha256', secret).update(value).digest('base64url');
    const now = () => Math.floor(Date.now() / 1000);
    let registrations = 0;
    let registrationWindowEnd = 0;

    function recordAttempt(attempts: Attempts, key: string, res: Response, error: string) {
        const time = now();
        for (const [id, attempt] of attempts) {
            if (attempt.end <= time) attempts.delete(id);
        }
        const attempt = attempts.get(key) ?? { count: 0, end: time + 60 };
        if (attempt.count >= 8) {
            res.set('Retry-After', String(attempt.end - time));
            res.status(429).json({ erro: error });
            return false;
        }
        attempt.count++;
        attempts.set(key, attempt);
        return true;
    }

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

    function startSession(req: Request, res: Response, session: Session, status = 200) {
        const time = now();
        for (const [id, existing] of sessions) if (existing.exp <= time) sessions.delete(id);
        const oldSession = sessionId(req.get('Cookie'));
        if (oldSession) sessions.delete(oldSession);
        const jti = randomBytes(16).toString('hex');
        const exp = time + lifetime;
        sessions.set(jti, { ...session, exp });
        const payload = Buffer.from(JSON.stringify({ sub: session.usuario, jti, iat: time, exp })).toString('base64url');
        const unsigned = header + '.' + payload;
        res.cookie(cookieName, unsigned + '.' + sign(unsigned), { ...cookieOptions, maxAge: lifetime * 1000 });
        res.status(status).json({ usuario: session.usuario, administrador: session.administrador });
    }

    router.post('/auth/register', readJson, (req, res) => {
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
        const { usuario: name, senha, confirmacao } = req.body ?? {};
        const login = typeof name === 'string' ? name.trim() : '';
        if (!validUsername(login) || !validPassword(senha, confirmacao)) {
            res.status(400).json({ erro: 'Use 3 a 32 letras sem acento, números, ponto, hífen ou sublinhado no usuário e confirme uma senha de 12 a 1024 caracteres.' });
            return;
        }
        const userSalt = randomBytes(16);
        const hash = scryptSync(senha, userSalt, 32);
        const workspace = randomBytes(16).toString('hex');
        const created = login.toLowerCase() !== adminLogin && db.prepare(
            'INSERT INTO usuarios (usuario, sal, senha, aprovado, workspace) VALUES (?, ?, ?, 1, ?) ON CONFLICT(usuario) DO NOTHING'
        ).run(login, userSalt, hash, workspace).changes;
        if (!created) {
            res.status(409).json({ erro: 'Esse nome de usuário já está em uso.' });
            return;
        }
        startSession(req, res, { usuario: login, administrador: false, workspace }, 201);
    });

    router.post('/auth/login', readJson, (req, res) => {
        const { usuario: name, senha } = req.body ?? {};
        const login = typeof name === 'string' ? name.trim() : '';
        const bootstrapAdmin = login.toLowerCase() === adminLogin;
        const account = bootstrapAdmin ? undefined : db.prepare(
            'SELECT usuario, sal, senha, aprovado, administrador, workspace FROM usuarios WHERE usuario = ?'
        ).get(login);
        const workspace = bootstrapAdmin ? 'installation' : String(account?.workspace ?? 'unknown');
        if (!recordAttempt(loginAttempts, workspace, res, 'Muitas tentativas. Aguarde um minuto.')) return;
        const persisted = bootstrapAdmin ? installationCredential.get(adminLogin) : account;
        const credential = persisted ? persisted as Credential : initialCredential;
        if (typeof senha !== 'string' || senha.length > 1024 ||
            !timingSafeEqual(scryptSync(senha, credential.sal, 32), credential.senha) || (!bootstrapAdmin && !account)) {
            res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
            return;
        }
        if (account && account.aprovado !== 1) {
            db.prepare('UPDATE usuarios SET aprovado = 1 WHERE usuario = ?').run(login);
        }
        loginAttempts.delete(workspace);
        startSession(req, res, {
            usuario: account ? String(account.usuario) : usuario,
            administrador: bootstrapAdmin || account?.administrador === 1,
            workspace
        });
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
        res.locals.sessionId = id;
        next();
    });
    router.put('/auth/password', readJson, (req, res) => {
        const { senhaAtual, novaSenha, confirmacao } = req.body ?? {};
        if (typeof senhaAtual !== 'string' || senhaAtual.length === 0 || senhaAtual.length > 1024 ||
            !validPassword(novaSenha, confirmacao)) {
            res.status(400).json({ erro: 'Informe a senha atual e confirme uma nova senha de 12 a 1024 caracteres.' });
            return;
        }

        const { workspace } = res.locals.session as Session;
        if (!recordAttempt(passwordAttempts, workspace, res, 'Muitas tentativas de alterar a senha. Aguarde um minuto.')) return;

        const isInstallation = workspace === 'installation';
        const persisted = isInstallation
            ? installationCredential.get(adminLogin)
            : db.prepare('SELECT sal, senha FROM usuarios WHERE workspace = ?').get(workspace);
        const credential = persisted ? persisted as Credential : isInstallation ? initialCredential : null;
        if (!credential || !timingSafeEqual(scryptSync(senhaAtual, credential.sal, 32), credential.senha)) {
            res.status(403).json({ erro: 'A senha atual está incorreta.' });
            return;
        }

        const newSalt = randomBytes(16);
        const newHash = scryptSync(novaSenha, newSalt, 32);
        let changes: number | bigint;
        if (!isInstallation) {
            changes = db.prepare('UPDATE usuarios SET sal = ?, senha = ? WHERE workspace = ? AND sal = ? AND senha = ?')
                .run(newSalt, newHash, workspace, credential.sal, credential.senha).changes;
        } else if (persisted) {
            changes = db.prepare('UPDATE credenciais_instalacao SET sal = ?, senha = ? WHERE usuario = ? AND sal = ? AND senha = ?')
                .run(newSalt, newHash, adminLogin, credential.sal, credential.senha).changes;
        } else {
            changes = db.prepare(`INSERT INTO credenciais_instalacao (usuario, sal, senha)
                VALUES (?, ?, ?) ON CONFLICT(usuario) DO NOTHING`).run(adminLogin, newSalt, newHash).changes;
        }
        if (!changes) {
            res.status(409).json({ erro: 'A senha mudou durante a solicitação. Tente novamente com a senha atual.' });
            return;
        }

        passwordAttempts.delete(workspace);
        loginAttempts.delete(workspace);
        for (const [id, session] of sessions) {
            if (id !== res.locals.sessionId && session.workspace === workspace) sessions.delete(id);
        }
        res.sendStatus(204);
    });
    router.get('/auth/profile', (_req, res) => {
        const { workspace } = res.locals.session as Session;
        const row = db.prepare('SELECT dados FROM perfis WHERE workspace = ?').get(workspace);
        res.json(row ? JSON.parse(String(row.dados)) : {});
    });
    router.put('/auth/profile', json({ limit: profileRequestLimit, inflate: false }), (req, res) => {
        const { workspace } = res.locals.session as Session;
        const profile = parseProfile(req.body);
        const row = db.prepare('SELECT dados FROM perfis WHERE workspace = ?').get(workspace);
        const existing = row ? JSON.parse(String(row.dados)) : {};
        for (const { key } of profileImages) {
            if (req.body[key] === undefined && typeof existing[key] === 'string') profile[key] = existing[key];
        }
        const stored = typeof existing.nomeEmpresa === 'string' ? { ...profile, nomeEmpresa: existing.nomeEmpresa } : profile;
        db.prepare(`
            INSERT INTO perfis (workspace, dados) VALUES (?, ?)
            ON CONFLICT(workspace) DO UPDATE SET dados = excluded.dados
        `).run(workspace, JSON.stringify(stored));
        res.json(profile);
    });
    return router;
}
