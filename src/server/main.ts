import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import express from 'express';
import { Ledger } from '../domain/ledger.ts';
import { api, handleError } from './api.ts';
import { SqliteRepository } from './sqlite.ts';

const databasePath = resolve(process.env.GFMEI_DB ?? 'data/gfmei.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

const app = express();
app.set('trust proxy', false);
app.use('/api', express.json({ limit: '32kb' }), api(new Ledger(new SqliteRepository(databasePath))));
app.use(express.static(resolve('dist')));
app.use(handleError);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, '127.0.0.1', () => console.log(`GF-MEI em http://127.0.0.1:${port}`));

