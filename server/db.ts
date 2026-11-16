/**
 * SQLite database (Node's built-in node:sqlite), one file at data/jobhunt.db.
 * The schema is versioned with PRAGMA user_version; each step in MIGRATIONS runs once, in order.
 */
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
/** JOBHUNT_DB=':memory:' gives tests a throwaway database. */
export const DB_FILE = process.env.JOBHUNT_DB ?? join(DATA_DIR, 'jobhunt.db');

const MIGRATIONS: string[] = [
  // 1: everything the JSON files held.
  `
  CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT 'neznámá',
    salary TEXT,                         -- JSON SalaryEstimate or NULL
    emails TEXT NOT NULL DEFAULT '[]'    -- JSON CompanyEmail[]
  );
  CREATE TABLE listings (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT '',
    place TEXT NOT NULL,
    contract TEXT NOT NULL DEFAULT '',
    stack TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',     -- JSON string[]
    salary_posted TEXT NOT NULL DEFAULT '',
    benefits TEXT NOT NULL DEFAULT '',
    fit INTEGER NOT NULL DEFAULT 3,
    fit_source TEXT NOT NULL DEFAULT 'auto',
    recommended INTEGER NOT NULL DEFAULT 0,
    strengths TEXT NOT NULL DEFAULT '',
    weaknesses TEXT NOT NULL DEFAULT '',
    vue TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    first_seen TEXT NOT NULL,
    last_checked TEXT NOT NULL,
    open INTEGER NOT NULL DEFAULT 1,
    closed_at TEXT,
    manual INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX listings_company ON listings(company_id);
  CREATE TABLE state (
    listing_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'new',
    note TEXT NOT NULL DEFAULT '',
    contacted_at TEXT NOT NULL DEFAULT '',
    next_at TEXT NOT NULL DEFAULT '',
    next_note TEXT NOT NULL DEFAULT '',
    follow_ups INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,  -- keeps the order they were written in
    id TEXT NOT NULL UNIQUE,
    listing_id TEXT NOT NULL REFERENCES state(listing_id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    at TEXT NOT NULL,
    time TEXT,
    status TEXT,
    text TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX events_listing ON events(listing_id);
  CREATE TABLE runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    added TEXT NOT NULL DEFAULT '[]',
    closed TEXT NOT NULL DEFAULT '[]',
    reopened TEXT NOT NULL DEFAULT '[]',
    changed TEXT NOT NULL DEFAULT '[]',
    errors TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL                  -- JSON
  );
  `,
];

export function openDb(file = DB_FILE): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const version = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  for (let v = version; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** The JSON files the app used before SQLite; read once, then moved to data/legacy-json/. */
export const LEGACY_FILES = ['listings.json', 'companies.json', 'state.json', 'runs.json', 'settings.json'] as const;

export function readLegacy(dir = DATA_DIR): Partial<Record<(typeof LEGACY_FILES)[number], unknown>> | null {
  const found = LEGACY_FILES.filter((f) => existsSync(join(dir, f)));
  if (!found.length) return null;
  return Object.fromEntries(found.map((f) => [f, JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown]));
}

export function retireLegacy(dir = DATA_DIR): void {
  const target = join(dir, 'legacy-json');
  mkdirSync(target, { recursive: true });
  for (const f of LEGACY_FILES) if (existsSync(join(dir, f))) renameSync(join(dir, f), join(target, f));
}
