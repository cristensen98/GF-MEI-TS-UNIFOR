import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import express from 'express';
import { Ledger } from '../domain/ledger.ts';
import { api, handleError } from './api.ts';
import { SqliteRepository } from './sqlite.ts';
import { auth } from './auth.ts';
import { apiJsonLimit, protectLocalHttp } from './http.ts';

const databasePath = resolve(process.env.GFMEI_DB ?? 'data/gfmei.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const authentication = auth(databasePath);
const repository = new SqliteRepository(databasePath);

const app = express();
app.set('trust proxy', false);
app.disable('x-powered-by');
app.use(protectLocalHttp);
app.use('/api', authentication, express.json({ limit: apiJsonLimit, inflate: false }),
    api(workspace => new Ledger(repository.forWorkspace(workspace))));
app.use(express.static(resolve('dist')));
app.use(handleError);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, '127.0.0.1', () => console.log(`GF-MEI em http://127.0.0.1:${port}`));

