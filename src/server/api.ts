import { Router } from 'express';
import type { ErrorRequestHandler } from 'express';
import { DomainError, kinds } from '../domain/model.ts';
import type { Ledger } from '../domain/ledger.ts';

function parseId(value: string | string[]) {
    if (Array.isArray(value)) {
        throw new DomainError('Identificador inválido.');
    }
    const id = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id <= 0) {
        throw new DomainError('Identificador inválido.');
    }
    return id;
}

export function api(forWorkspace: (workspace: string) => Ledger) {
    const router = Router();
    router.use((_req, res, next) => {
        const workspace = res.locals.session?.workspace;
        if (workspace !== 'installation' && (typeof workspace !== 'string' || !/^[a-f0-9]{32}$/.test(workspace))) {
            res.status(403).json({ erro: 'A conta não tem um espaço financeiro válido.' });
            return;
        }
        res.locals.ledger = forWorkspace(workspace);
        next();
    });
    router.get('/resumo/:mes', (req, res) => {
        res.json((res.locals.ledger as Ledger).monthlySummary(req.params.mes));
    });
    router.get('/resumo/anual/:ano', (req, res) => {
        res.json((res.locals.ledger as Ledger).annualCashSummary(req.params.ano));
    });
    router.get('/servicos/:id/resumo', (req, res) => {
        res.json((res.locals.ledger as Ledger).serviceSummary(parseId(req.params.id)));
    });
    for (const kind of kinds) {
        const resource = '/' + kind;
        router.get(resource, (_req, res) => { res.json((res.locals.ledger as Ledger).list(kind)); });
        router.get(resource + '/:id', (req, res) => { res.json((res.locals.ledger as Ledger).get(kind, parseId(req.params.id))); });
        router.post(resource, (req, res) => { res.status(201).json((res.locals.ledger as Ledger).save(kind, req.body)); });
        router.put(resource + '/:id', (req, res) => { res.json((res.locals.ledger as Ledger).save(kind, req.body, parseId(req.params.id))); });
        router.delete(resource + '/:id', (req, res) => {
            (res.locals.ledger as Ledger).cancel(kind, parseId(req.params.id));
            res.sendStatus(204);
        });
    }
    router.use((_req, res) => { res.status(404).json({ erro: 'Rota não encontrada.' }); });
    return router;
}

export const handleError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }
    const status = error instanceof Error && 'status' in error ? error.status : undefined;
    if (error instanceof DomainError) {
        res.status(error.status).json({ erro: error.message });
    } else if (status === 400) {
        res.status(400).json({ erro: error instanceof SyntaxError ? 'JSON inválido.' : 'Solicitação inválida.' });
    } else if (status === 413) {
        res.status(413).json({ erro: 'Os dados enviados excedem o limite permitido.' });
    } else if (status === 415) {
        res.status(415).json({ erro: 'Envie os dados em JSON UTF-8 sem compactação.' });
    } else {
        console.error('Falha interna ao processar uma solicitação do GF-MEI.');
        res.status(500).json({ erro: 'Falha ao processar a solicitação.' });
    }
};

