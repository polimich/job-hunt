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

/**
 * v0.8 made the search configurable. Places become "local" (the search town) / remote / elsewhere.
 * A database that already has settings or listings keeps behaving as before: its old built-in
 * defaults (Brno, the Vue keywords, the title filters, the skills) are written out as settings,
 * because the new built-in defaults are empty.
 */
function searchProfile(db: DatabaseSync): void {
  db.exec(`UPDATE listings SET place = CASE place WHEN 'brno' THEN 'local' WHEN 'remote' THEN 'remote' ELSE 'jinde' END`);
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  if (!count('SELECT COUNT(*) AS n FROM listings') && !count('SELECT COUNT(*) AS n FROM settings')) return;
  const stored = new Map((db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]).map((r) => [r.key, JSON.parse(r.value) as unknown]));
  const list = (key: string, fallback: string[]) => (Array.isArray(stored.get(key)) ? (stored.get(key) as string[]) : fallback);
  const keywords = [...new Set([...list('keywords', ['react', 'frontend developer', 'full stack', 'typescript']), ...list('vueKeywords', ['vue', 'nuxt'])])];
  const oldExclude = typeof stored.get('excludeTitle') === 'string' ? (stored.get('excludeTitle') as string) : '';
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const set = (key: string, value: unknown) => put.run(key, JSON.stringify(value));
  const keep = (key: string, value: unknown) => !stored.has(key) && set(key, value);
  set('keywords', keywords);
  set('location', 'Brno');
  set('radiusKm', 0);
  set('remote', true);
  set('postedWithinDays', 10);
  set('titleMustMatch', ['react', 'vue', 'nuxt', 'frontend', 'full stack', 'typescript', 'javascript', 'web developer', 'web engineer', 'software engineer', 'software developer', 'vývojář', 'vývojářka', 'programátor', 'programátorka', 'developer']);
  set(
    'excludeWords',
    oldExclude
      ? oldExclude.split('|').map((w) => w.replace(/\\b|[()?:^$\\]/g, '').trim()).filter(Boolean)
      : ['java', 'php', 'android', 'ios', 'devops', 'data engineer', 'data scientist', 'data analyst', 'qa', 'tester', 'test engineer', 'sales', 'marketing', 'c++', 'embedded', 'ruby', 'golang', 'designer', 'product manager', 'product owner', 'support', 'kotlin', 'swift', 'machine learning', 'analyst', 'sap', 'salesforce', 'security', 'sre', 'recruiter', 'manager', 'intern', 'scientist', 'firmware', 'hardware', 'consultant', 'architect', 'rust', 'backend', 'servicenow', 'sharepoint', 'mainframe', 'director', 'lead', 'principal', 'staff', 'junior', 'power platform'],
  );
  set('mpsvCategories', ['251']);
  set('level', 'medior');
  keep('skills', ['React', 'TypeScript', 'JavaScript', 'Vue', 'Next.js', 'Node', 'HTML', 'CSS', 'Tailwind', 'REST', 'Git']);
  db.prepare("DELETE FROM settings WHERE key IN ('vueKeywords', 'excludeTitle')").run();
}

const MIGRATIONS: (string | ((db: DatabaseSync) => void))[] = [
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
  // 2: people, and my own rating / labels / referral per application.
  `
  CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    linkedin TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX contacts_company ON contacts(company_id);
  ALTER TABLE state ADD COLUMN rating INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE state ADD COLUMN labels TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE state ADD COLUMN referred_by TEXT NOT NULL DEFAULT '';
  ALTER TABLE events ADD COLUMN contact_id TEXT;
  `,
  // 3: to-dos per application.
  `
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    title TEXT NOT NULL,
    due TEXT NOT NULL DEFAULT '',
    done_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX tasks_listing ON tasks(listing_id);
  `,
  // 4: interview rounds, and documents (CV versions) sent with applications.
  `
  ALTER TABLE events ADD COLUMN round TEXT;
  CREATE TABLE docs (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'cv',
    file_name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  ALTER TABLE state ADD COLUMN doc_ids TEXT NOT NULL DEFAULT '[]';
  `,
  // 5: offer details per application.
  `
  ALTER TABLE state ADD COLUMN offer TEXT;
  `,
  // 6: a general search profile instead of one person's Brno/Vue setup.
  searchProfile,
  // 7: e-mail from Gmail (removed in 8; kept so the version numbers stay in order).
  `
  CREATE TABLE mail_threads (
    id TEXT PRIMARY KEY,
    listing_id TEXT,
    company_id TEXT,
    match_reason TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    listing_id TEXT,
    company_id TEXT,
    direction TEXT NOT NULL,
    from_addr TEXT NOT NULL DEFAULT '',
    from_name TEXT NOT NULL DEFAULT '',
    to_addrs TEXT NOT NULL DEFAULT '[]',
    subject TEXT NOT NULL DEFAULT '',
    snippet TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    sent_at TEXT NOT NULL,
    rfc_message_id TEXT NOT NULL DEFAULT '',
    in_reply_to TEXT NOT NULL DEFAULT '',
    refs TEXT NOT NULL DEFAULT '',
    cls TEXT NOT NULL,
    calendar TEXT NOT NULL DEFAULT '',
    attachments TEXT NOT NULL DEFAULT '[]',
    event_id TEXT,
    match_reason TEXT NOT NULL DEFAULT '',
    confidence TEXT NOT NULL DEFAULT '',
    triage TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX messages_listing ON messages(listing_id);
  CREATE INDEX messages_thread ON messages(thread_id);
  CREATE INDEX messages_rfc ON messages(rfc_message_id);
  CREATE TABLE suggestions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    status TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );
  CREATE TABLE mail_sync (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  // 8: Gmail integration removed again (too much setup for a personal tool).
  `
  DROP TABLE IF EXISTS messages;
  DROP TABLE IF EXISTS mail_threads;
  DROP TABLE IF EXISTS suggestions;
  DROP TABLE IF EXISTS mail_sync;
  `,
  // 9: AI summaries of postings. A failed attempt keeps its error and hash, so it is not retried
  // until the posting changes or the owner asks again.
  `
  CREATE TABLE summaries (
    listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
    hash TEXT NOT NULL,
    data TEXT,
    error TEXT,
    updated_at TEXT NOT NULL
  );
  `,
  // 10: the sorting deck: why I passed on a posting, and "later".
  `
  ALTER TABLE state ADD COLUMN pass_reason TEXT NOT NULL DEFAULT '';
  ALTER TABLE state ADD COLUMN deferred_at TEXT NOT NULL DEFAULT '';
  `,
  // 11: application kits (one per posting) and web research (one per company).
  `
  CREATE TABLE kits (
    listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
    data TEXT,
    error TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE research (
    company_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
      const step = MIGRATIONS[v]!;
      if (typeof step === 'string') db.exec(step);
      else step(db);
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
