import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { auth } from '../src/server/auth.ts';
import { handleError } from '../src/server/api.ts';
import { protectLocalHttp } from '../src/server/http.ts';
import { maxProfileCoverBytes, maxProfilePhotoBytes } from '../src/domain/profile.ts';

test('cadastro público cria uma sessão comum sem aprovação', async () => {
    process.env.GFMEI_USER = 'admin-teste';
    process.env.GFMEI_PASSWORD = 'senha-admin-de-teste';
    process.env.GFMEI_JWT_SECRET = 'segredo-de-teste-local-com-32-bytes';
    const app = express();
    app.use(protectLocalHttp, auth(':memory:'));
    app.use(handleError);
    const server = app.listen(0, '127.0.0.1');
    try {
        await once(server, 'listening');
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const base = 'http://127.0.0.1:' + address.port + '/auth/';
        const senha = 'senha-usuario-de-teste';
        const registration = await fetch(base + 'register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: 'mei-teste', senha, confirmacao: senha })
        });
        assert.equal(registration.status, 201);
        assert.match(registration.headers.get('Content-Security-Policy') ?? '', /frame-ancestors 'none'/);
        assert.equal(registration.headers.get('X-Content-Type-Options'), 'nosniff');
        const expected = { usuario: 'mei-teste', administrador: false };
        assert.deepEqual(await registration.json(), expected);
        const cookie = registration.headers.getSetCookie()[0].split(';')[0];
        assert.deepEqual(await (await fetch(base + 'session', { headers: { Cookie: cookie } })).json(), expected);
        assert.equal((await fetch(base + 'accounts', { headers: { Cookie: cookie } })).status, 404);
        const config = {
            method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }
        };
        assert.equal((await fetch(base + 'profile', { ...config, body: '{' })).status, 400);
        const oversized = JSON.stringify({ data: 'a'.repeat(1200 * 1024) });
        assert.equal((await fetch(base + 'profile', { ...config, body: oversized })).status, 413);
        const withoutSession = await fetch(base + 'profile', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: oversized
        });
        assert.equal(withoutSession.status, 401);
        const unsupported = await fetch(base + 'profile', {
            method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json; charset=iso-8859-1' }, body: '{}'
        });
        assert.equal(unsupported.status, 415);
        const profile = { nomeExibicao: 'Meu MEI', cnpj: 'ab123456000199', razaoSocial: 'Loja MEI',
            email: 'mei@example.test', telefone: '', whatsapp: '', bio: 'Sobre a empresa' };
        const update = await fetch(base + 'profile', {
            method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
        });
        assert.equal(update.status, 200);
        const saved = await update.json();
        assert.equal(saved.nomeExibicao, profile.nomeExibicao);
        assert.equal(saved.cnpj, 'AB.123.456/0001-99');
        for (const cnpj of ['123', 'AB.123.456/0001-A9']) {
            const invalid = await fetch(base + 'profile', {
                method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...profile, cnpj })
            });
            assert.equal(invalid.status, 400);
        }
        assert.deepEqual(await (await fetch(base + 'profile', { headers: { Cookie: cookie } })).json(), saved);
        const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
        const changeImages = (images: { foto?: string; capa?: string }) => fetch(base + 'profile', {
            method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...profile, ...images })
        });
        const pngPayload = (size: number) => {
            const bytes = Buffer.alloc(size);
            bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            return 'data:image/png;base64,' + bytes.toString('base64');
        };
        assert.equal((await changeImages({ foto: 'data:image/png;base64,AAAA' })).status, 400);
        assert.equal((await changeImages({ capa: 'data:image/png;base64,AAAA' })).status, 400);
        assert.equal((await changeImages({ capa: pngPayload(maxProfileCoverBytes + 1) })).status, 400);
        const largestImages = await changeImages({
            foto: pngPayload(maxProfilePhotoBytes), capa: pngPayload(maxProfileCoverBytes)
        });
        assert.equal(largestImages.status, 200);
        const largestProfile = await largestImages.json();
        assert.equal(largestProfile.foto, pngPayload(maxProfilePhotoBytes));
        assert.equal(largestProfile.capa, pngPayload(maxProfileCoverBytes));
        assert.equal((await changeImages({ foto: photo, capa: photo })).status, 200);
        const savedImages = await (await fetch(base + 'profile', { headers: { Cookie: cookie } })).json();
        assert.equal(savedImages.foto, photo);
        assert.equal(savedImages.capa, photo);
        const withoutPhoto = await (await changeImages({ foto: '' })).json();
        assert.equal(withoutPhoto.foto, undefined);
        assert.equal(withoutPhoto.capa, photo);
        assert.equal((await fetch(base + 'profile')).status, 401);
        const another = await fetch(base + 'register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: 'outro-mei', senha, confirmacao: senha })
        });
        assert.equal(another.status, 201);
        const anotherCookie = another.headers.getSetCookie()[0].split(';')[0];
        assert.deepEqual(await (await fetch(base + 'profile', { headers: { Cookie: anotherCookie } })).json(), {});
        const withoutCover = await (await changeImages({ capa: '' })).json();
        assert.equal(withoutCover.capa, undefined);
        assert.equal(withoutCover.nomeExibicao, profile.nomeExibicao);
    } finally {
        server.close();
    }
});
