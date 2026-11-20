import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import express from 'express';
import { Ledger } from '../domain/ledger.ts';
import { api, handleError } from './api.ts';
import { SqliteRepository } from './sqlite.ts';
import { auth } from './auth.ts';

const databasePath = resolve(process.env.GFMEI_DB ?? 'data/gfmei.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const authentication = auth(databasePath);

const app = express();
app.set('trust proxy', false);
app.use('/api', express.json({ limit: '32kb' }), authentication, api(new Ledger(new SqliteRepository(databasePath))));
app.use(express.static(resolve('dist')));
app.use(handleError);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, '127.0.0.1', () => console.log(`GF-MEI em http://127.0.0.1:${port}`));

