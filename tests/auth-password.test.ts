import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { auth } from '../src/server/auth.ts';

test('a própria conta pode trocar a senha e manter apenas a sessão que pediu a alteração', async () => {
    const originalAdmin = 'senha-admin-de-teste';
    process.env.GFMEI_USER = 'admin-teste';
    process.env.GFMEI_PASSWORD = originalAdmin;
    process.env.GFMEI_JWT_SECRET = 'segredo-de-teste-local-com-32-bytes';
    const app = express();
    app.use(auth(':memory:'));
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const base = 'http://127.0.0.1:' + address.port + '/auth/';
        const original = 'senha-original-de-teste';
        const newPassword = 'nova-senha-de-teste';
        const readCookie = (response: Response) => response.headers.getSetCookie()[0].split(';')[0];
        const signIn = (usuario: string, senha: string) => fetch(base + 'login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, senha })
        });
        const readSession = async (cookie: string) =>
            (await fetch(base + 'session', { headers: { Cookie: cookie } })).json();
        const change = (cookie: string, senhaAtual: string, novaSenha: string, confirmacao = novaSenha) =>
            fetch(base + 'password', {
                method: 'PUT',
                headers: { Cookie: cookie, 'Content-Type': 'application/json' },
                body: JSON.stringify({ senhaAtual, novaSenha, confirmacao })
            });

        assert.equal((await change('', original, newPassword)).status, 401);
        const registration = await fetch(base + 'register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: 'mei-teste', senha: original, confirmacao: original })
        });
        assert.equal(registration.status, 201);
        const active = readCookie(registration);
        const secondLogin = await signIn('mei-teste', original);
        assert.equal(secondLogin.status, 200);
        const second = readCookie(secondLogin);
        const adminLogin = await signIn('admin-teste', originalAdmin);
        assert.equal(adminLogin.status, 200);
        const activeAdmin = readCookie(adminLogin);
        assert.equal((await fetch(base + 'accounts', { headers: { Cookie: activeAdmin } })).status, 404);

        assert.equal((await change(active, original, 'curta')).status, 400);
        assert.equal((await change(active, original, newPassword, original)).status, 400);
        assert.equal((await change(active, 'senha-incorreta', newPassword)).status, 403);
        assert.equal((await readSession(second)).usuario, 'mei-teste');
        assert.equal((await change(active, original, newPassword)).status, 204);
        assert.equal((await readSession(active)).usuario, 'mei-teste');
        assert.equal(await readSession(second), null);
        assert.equal((await readSession(activeAdmin)).administrador, true);
        assert.equal((await signIn('mei-teste', newPassword)).status, 200);
        assert.equal((await signIn('mei-teste', original)).status, 401);

        const secondAdminLogin = await signIn('admin-teste', originalAdmin);
        assert.equal(secondAdminLogin.status, 200);
        const secondAdmin = readCookie(secondAdminLogin);
        const newAdmin = 'nova-senha-admin-teste';
        assert.equal((await change(activeAdmin, originalAdmin, newAdmin)).status, 204);
        assert.equal((await readSession(activeAdmin)).administrador, true);
        assert.equal(await readSession(secondAdmin), null);
        assert.equal((await readSession(active)).usuario, 'mei-teste');
        assert.equal((await signIn('admin-teste', newAdmin)).status, 200);
        assert.equal((await signIn('admin-teste', originalAdmin)).status, 401);
        assert.equal((await change(activeAdmin, newAdmin, originalAdmin)).status, 204);
        assert.equal((await signIn('admin-teste', originalAdmin)).status, 200);

        assert.equal((await signIn('mei-teste', newPassword)).status, 200);
        for (let i = 0; i < 8; i++) assert.equal((await signIn('mei-teste', original)).status, 401);
        assert.equal((await signIn('admin-teste', originalAdmin)).status, 200);
        const throttled = await signIn('mei-teste', newPassword);
        assert.equal(throttled.status, 429);
        assert.ok(Number(throttled.headers.get('Retry-After')) > 0);
    } finally {
        server.close();
    }
});
