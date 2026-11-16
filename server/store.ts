/** The database is a handful of JSON files in data/. Small enough to read and write whole. */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeState } from '../shared/pipeline.ts';
import type { Company, Db, Listing, ListingState, RefreshRun, Settings } from '../shared/types.ts';

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

const DEFAULT_SETTINGS: Settings = {
  introCs: { subject: 'Zájem o pozici {title}', body: '' },
  introEn: { subject: 'Application for {title}', body: '' },
  keywords: ['react', 'frontend developer', 'full stack', 'typescript'],
  vueKeywords: ['vue', 'nuxt'],
  excludeTitle: '',
  minSalary: 100000,
  followUpDays: 7,
  autoRefresh: true,
};

function read<T>(name: string, fallback: T): T {
  const file = join(DATA_DIR, name);
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** Write through a temp file so a crash mid-write cannot leave half a file. */
function write(name: string, value: unknown): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const file = join(DATA_DIR, name);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 1)}\n`);
  renameSync(`${file}.tmp`, file);
}

export const loadListings = () => read<Listing[]>('listings.json', []);
export const saveListings = (v: Listing[]) => write('listings.json', v);
export const loadCompanies = () => read<Company[]>('companies.json', []);
export const saveCompanies = (v: Company[]) => write('companies.json', v);
export function loadState(): Record<string, ListingState> {
  const raw = read<Record<string, Partial<ListingState>>>('state.json', {});
  return Object.fromEntries(Object.entries(raw).map(([id, st]) => [id, normalizeState(st)]));
}
export const saveState = (v: Record<string, ListingState>) => write('state.json', v);
export const loadRuns = () => read<RefreshRun[]>('runs.json', []);
export const saveRuns = (v: RefreshRun[]) => write('runs.json', v);
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>('settings.json', {}) });
export const saveSettings = (v: Settings) => write('settings.json', v);

export function loadDb(): Db {
  return {
    listings: loadListings(),
    companies: loadCompanies(),
    state: loadState(),
    runs: loadRuns(),
    settings: loadSettings(),
  };
}

export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
