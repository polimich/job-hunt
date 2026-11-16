/** Load API keys from .env (not in git) before anything reads process.env. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './db.ts';

const file = join(DATA_DIR, '..', '.env');
if (existsSync(file)) process.loadEnvFile(file);
