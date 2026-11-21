import type { RequestHandler } from 'express';

export const apiJsonLimit = '32kb';

export const protectLocalHttp: RequestHandler = (req, res, next) => {
    res.set({
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
    });
    if (!/^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i.test(req.get('Host') ?? '')) {
        res.status(403).json({ erro: 'Endereço local inválido.' });
        return;
    }
    next();
};
