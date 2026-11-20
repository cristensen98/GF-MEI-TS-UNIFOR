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

export function api(ledger: Ledger) {
    const router = Router();
    router.get('/resumo/:mes', (req, res) => {
        res.json(ledger.monthlySummary(req.params.mes));
    });
    router.get('/servicos/:id/resumo', (req, res) => {
        res.json(ledger.serviceSummary(parseId(req.params.id)));
    });
    for (const kind of kinds) {
        const resource = '/' + kind;
        router.get(resource, (_req, res) => { res.json(ledger.list(kind)); });
        router.get(resource + '/:id', (req, res) => { res.json(ledger.get(kind, parseId(req.params.id))); });
        router.post(resource, (req, res) => { res.status(201).json(ledger.save(kind, req.body)); });
        router.put(resource + '/:id', (req, res) => { res.json(ledger.save(kind, req.body, parseId(req.params.id))); });
        router.delete(resource + '/:id', (req, res) => {
            ledger.cancel(kind, parseId(req.params.id));
            res.sendStatus(204);
        });
    }
    router.use((_req, res) => { res.status(404).json({ erro: 'Rota não encontrada.' }); });
    return router;
}

export const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof DomainError) {
        res.status(error.status).json({ erro: error.message });
    } else if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
        res.status(400).json({ erro: 'JSON inválido.' });
    } else {
        console.error(error);
        res.status(500).json({ erro: 'Falha ao processar o lançamento.' });
    }
};

