/**
 * Data access over SQLite. Functions keep the shape the rest of the server already uses
 * (whole lists for listings/companies, one record for state), backed by real tables.
 */
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeState } from '../shared/pipeline.ts';
import type { Company, Contact, Db, Doc, Offer, Task, Listing, ListingState, RefreshRun, Settings, TrackEvent } from '../shared/types.ts';
import { DATA_DIR, DB_FILE, openDb, readLegacy, retireLegacy, transaction } from './db.ts';

export { DATA_DIR };

// ---------- document files ----------

export const DOCS_DIR = join(DATA_DIR, 'docs');
export const DOC_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
export const docPath = (d: Doc) => join(DOCS_DIR, `${d.id}${extname(d.fileName).toLowerCase()}`);


const DEFAULT_SETTINGS: Settings = {
  introCs: { subject: 'Zájem o pozici {title}', body: '' },
  introEn: { subject: 'Application for {title}', body: '' },
  // A new install starts empty; the first visit to Settings asks for keywords and a town.
  keywords: [],
  location: '',
  radiusKm: 0,
  remote: true,
  postedWithinDays: 14,
  titleMustMatch: [],
  excludeWords: [],
  mpsvCategories: [],
  level: 'any',
  minSalary: 0,
  followUpDays: 7,
  autoRefresh: true,
  weeklyGoal: 5,
  sources: {},
  skills: [],
  templates: {
    followUp: {
      cs: {
        subject: 'Re: {title}',
        body: 'Dobrý den,\n\nchtěl bych se jen připomenout ohledně mé přihlášky na pozici {title}. O pozici mám stále velký zájem a rád doplním cokoli, co by se hodilo.\n\nDěkuji a přeji hezký den',
      },
      en: {
        subject: 'Re: {title}',
        body: 'Hi{name},\n\nI wanted to follow up on my application for the {title} role at {company}. I am still very interested and happy to share anything else that would help.\n\nThank you and have a great day',
      },
    },
    thankYou: {
      cs: {
        subject: 'Děkuji za dnešní rozhovor – {title}',
        body: 'Dobrý den,\n\nděkuji za čas a příjemný rozhovor o pozici {title}. Utvrdil jsem se v tom, že by mě práce v {company} bavila. Budu rád za informaci o dalším kroku.\n\nS pozdravem',
      },
      en: {
        subject: 'Thank you – {title} interview',
        body: 'Hi{name},\n\nthank you for your time today and the great conversation about the {title} role. It confirmed that I would love to work at {company}. I look forward to hearing about the next steps.\n\nBest regards',
      },
    },
    decline: {
      cs: {
        subject: 'Pozice {title}',
        body: 'Dobrý den,\n\nmoc děkuji za nabídku a za čas, který jste mi věnovali. Po zvážení jsem se rozhodl jít jinou cestou, a proto nabídku nepřijmu. Rád bych zůstal v kontaktu.\n\nS pozdravem',
      },
      en: {
        subject: '{title} position',
        body: 'Hi{name},\n\nthank you very much for the offer and for your time. After careful thought I have decided to go a different way, so I will not accept. I would be glad to stay in touch.\n\nBest regards',
      },
    },
  },
};

type Row = Record<string, unknown>;
const json = <T>(v: unknown, fallback: T): T => (typeof v === 'string' && v ? (JSON.parse(v) as T) : fallback);

let conn: DatabaseSync | undefined;

/** The open database; created and migrated (including the one-time JSON import) on first use. */
export function db(): DatabaseSync {
  if (!conn) {
    conn = openDb();
    importLegacyOnce(conn);
  }
  return conn;
}

/**
 * Swap in another database file (a backup, or a copy moved from another machine). The current
 * one is saved to backups/ first. The file is checked to be a job-hunt database before use.
 */
export function replaceDb(upload: string): string {
  const probe = new DatabaseSync(upload, { readOnly: true });
  try {
    const tables = (probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    if (!tables.includes('listings') || !tables.includes('state')) throw new Error('Tohle není databáze job-hunt.');
  } finally {
    probe.close();
  }
  const saved = join(DATA_DIR, 'backups', `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  mkdirSync(dirname(saved), { recursive: true });
  db().exec(`VACUUM INTO '${saved.replaceAll("'", "''")}'`);
  conn!.close();
  conn = undefined;
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) rmSync(f, { force: true });
  renameSync(upload, DB_FILE);
  db();
  return saved;
}

/** For tests: start over with a fresh database. */
export function useDb(next: DatabaseSync): void {
  conn = next;
}

// ---------- listings ----------

const toListing = (r: Row): Listing => ({
  id: r.id as string,
  companyId: r.company_id as string,
  company: r.company as string,
  title: r.title as string,
  url: r.url as string,
  source: r.source as Listing['source'],
  sourceId: r.source_id as string,
  location: r.location as string,
  mode: r.mode as string,
  place: r.place as Listing['place'],
  contract: r.contract as string,
  stack: r.stack as string,
  tags: json<string[]>(r.tags, []),
  salaryPosted: r.salary_posted as string,
  benefits: r.benefits as string,
  fit: Number(r.fit),
  fitSource: r.fit_source as Listing['fitSource'],
  recommended: !!r.recommended,
  strengths: r.strengths as string,
  weaknesses: r.weaknesses as string,
  vue: r.vue as string,
  text: r.text as string,
  firstSeen: r.first_seen as string,
  lastChecked: r.last_checked as string,
  open: !!r.open,
  ...(r.closed_at ? { closedAt: r.closed_at as string } : {}),
  ...(r.manual ? { manual: true } : {}),
});

const LISTING_UPSERT = `
  INSERT INTO listings (id, company_id, company, title, url, source, source_id, location, mode, place, contract, stack, tags,
    salary_posted, benefits, fit, fit_source, recommended, strengths, weaknesses, vue, text, first_seen, last_checked, open, closed_at, manual)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET company_id = excluded.company_id, company = excluded.company, title = excluded.title, url = excluded.url,
    source = excluded.source, source_id = excluded.source_id, location = excluded.location, mode = excluded.mode, place = excluded.place,
    contract = excluded.contract, stack = excluded.stack, tags = excluded.tags, salary_posted = excluded.salary_posted, benefits = excluded.benefits,
    fit = excluded.fit, fit_source = excluded.fit_source, recommended = excluded.recommended, strengths = excluded.strengths,
    weaknesses = excluded.weaknesses, vue = excluded.vue, text = excluded.text, first_seen = excluded.first_seen,
    last_checked = excluded.last_checked, open = excluded.open, closed_at = excluded.closed_at, manual = excluded.manual`;

function upsertListing(l: Listing): void {
  db()
    .prepare(LISTING_UPSERT)
    .run(
      l.id, l.companyId, l.company, l.title, l.url, l.source, l.sourceId, l.location, l.mode, l.place, l.contract, l.stack,
      JSON.stringify(l.tags), l.salaryPosted, l.benefits, l.fit, l.fitSource, l.recommended ? 1 : 0, l.strengths, l.weaknesses,
      l.vue, l.text, l.firstSeen, l.lastChecked, l.open ? 1 : 0, l.closedAt ?? null, l.manual ? 1 : 0,
    );
}

export const loadListings = (): Listing[] => (db().prepare('SELECT * FROM listings ORDER BY rowid').all() as Row[]).map(toListing);
/** Insert or update every listing given. Listings not in the list are left alone; see deleteListing. */
export const saveListings = (list: Listing[]): void => transaction(db(), () => list.forEach(upsertListing));
export const saveListing = (l: Listing): void => upsertListing(l);

export function deleteListing(id: string): void {
  transaction(db(), () => {
    db().prepare('DELETE FROM state WHERE listing_id = ?').run(id);
    db().prepare('DELETE FROM tasks WHERE listing_id = ?').run(id);
    db().prepare('DELETE FROM listings WHERE id = ?').run(id);
  });
}

// ---------- companies ----------

const toCompany = (r: Row): Company => ({
  id: r.id as string,
  name: r.name as string,
  size: r.size as Company['size'],
  ...(r.salary ? { salary: json(r.salary, undefined) } : {}),
  emails: json(r.emails, []),
});

function upsertCompany(c: Company): void {
  db()
    .prepare(
      `INSERT INTO companies (id, name, size, salary, emails) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, size = excluded.size, salary = excluded.salary, emails = excluded.emails`,
    )
    .run(c.id, c.name, c.size, c.salary ? JSON.stringify(c.salary) : null, JSON.stringify(c.emails ?? []));
}

export const loadCompanies = (): Company[] => (db().prepare('SELECT * FROM companies ORDER BY rowid').all() as Row[]).map(toCompany);
export const saveCompanies = (list: Company[]): void => transaction(db(), () => list.forEach(upsertCompany));
export const deleteCompany = (id: string): void => void db().prepare('DELETE FROM companies WHERE id = ?').run(id);

// ---------- state + history ----------

const toEvent = (r: Row): TrackEvent => ({
  id: r.id as string,
  kind: r.kind as TrackEvent['kind'],
  at: r.at as string,
  ...(r.time ? { time: r.time as string } : {}),
  ...(r.status ? { status: r.status as TrackEvent['status'] } : {}),
  ...(r.contact_id ? { contactId: r.contact_id as string } : {}),
  ...(r.round ? { round: r.round as TrackEvent['round'] } : {}),
  text: r.text as string,
});

const toState = (r: Row, events: TrackEvent[]): ListingState => ({
  status: r.status as ListingState['status'],
  note: r.note as string,
  contactedAt: r.contacted_at as string,
  nextAt: r.next_at as string,
  nextNote: r.next_note as string,
  followUps: Number(r.follow_ups),
  rating: Number(r.rating ?? 0),
  labels: json<string[]>(r.labels, []),
  referredBy: (r.referred_by as string) ?? '',
  docIds: json<string[]>(r.doc_ids, []),
  ...(r.offer ? { offer: json<Offer>(r.offer, undefined as never) } : {}),
  events,
  updatedAt: r.updated_at as string,
});

export function loadState(): Record<string, ListingState> {
  const events = new Map<string, TrackEvent[]>();
  for (const r of db().prepare('SELECT * FROM events ORDER BY seq').all() as Row[]) {
    const id = r.listing_id as string;
    events.set(id, [...(events.get(id) ?? []), toEvent(r)]);
  }
  const out: Record<string, ListingState> = {};
  for (const r of db().prepare('SELECT * FROM state').all() as Row[]) out[r.listing_id as string] = toState(r, events.get(r.listing_id as string) ?? []);
  return out;
}

export function getState(id: string): ListingState | undefined {
  const r = db().prepare('SELECT * FROM state WHERE listing_id = ?').get(id) as Row | undefined;
  if (!r) return undefined;
  return toState(r, (db().prepare('SELECT * FROM events WHERE listing_id = ? ORDER BY seq').all(id) as Row[]).map(toEvent));
}

/** Store one application's state, replacing its history with `st.events`. */
export function putState(id: string, st: ListingState): void {
  transaction(db(), () => writeState(id, st));
}

function writeState(id: string, st: ListingState): void {
  db()
    .prepare(
      `INSERT INTO state (listing_id, status, note, contacted_at, next_at, next_note, follow_ups, rating, labels, referred_by, doc_ids, offer, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(listing_id) DO UPDATE SET status = excluded.status, note = excluded.note, contacted_at = excluded.contacted_at,
         next_at = excluded.next_at, next_note = excluded.next_note, follow_ups = excluded.follow_ups, rating = excluded.rating,
         labels = excluded.labels, referred_by = excluded.referred_by, doc_ids = excluded.doc_ids, offer = excluded.offer, updated_at = excluded.updated_at`,
    )
    .run(id, st.status, st.note, st.contactedAt, st.nextAt, st.nextNote, st.followUps, st.rating ?? 0, JSON.stringify(st.labels ?? []), st.referredBy ?? '', JSON.stringify(st.docIds ?? []), st.offer ? JSON.stringify(st.offer) : null, st.updatedAt);
  // Events are append-mostly; rewriting this one application's few rows keeps the order exact.
  db().prepare('DELETE FROM events WHERE listing_id = ?').run(id);
  const insert = db().prepare('INSERT INTO events (id, listing_id, kind, at, time, status, contact_id, round, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const e of st.events) insert.run(e.id, id, e.kind, e.at, e.time ?? null, e.status ?? null, e.contactId ?? null, e.round ?? null, e.text);
}

// ---------- contacts ----------

const toContact = (r: Row): Contact => ({
  id: r.id as string,
  companyId: r.company_id as string,
  name: r.name as string,
  role: r.role as string,
  email: r.email as string,
  phone: r.phone as string,
  linkedin: r.linkedin as string,
  note: r.note as string,
  createdAt: r.created_at as string,
});

export const loadContacts = (): Contact[] => (db().prepare('SELECT * FROM contacts ORDER BY name COLLATE NOCASE').all() as Row[]).map(toContact);
export const getContact = (id: string): Contact | undefined => {
  const r = db().prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Row | undefined;
  return r ? toContact(r) : undefined;
};

export function saveContact(c: Contact): void {
  db()
    .prepare(
      `INSERT INTO contacts (id, company_id, name, role, email, phone, linkedin, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET company_id = excluded.company_id, name = excluded.name, role = excluded.role, email = excluded.email,
         phone = excluded.phone, linkedin = excluded.linkedin, note = excluded.note`,
    )
    .run(c.id, c.companyId, c.name, c.role, c.email, c.phone, c.linkedin, c.note, c.createdAt);
}

/** Remove a person; history entries that named them keep their text but lose the link. */
export function deleteContact(id: string): void {
  transaction(db(), () => {
    db().prepare('UPDATE events SET contact_id = NULL WHERE contact_id = ?').run(id);
    db().prepare('DELETE FROM contacts WHERE id = ?').run(id);
  });
}

// ---------- tasks ----------

const toTask = (r: Row): Task => ({
  id: r.id as string,
  listingId: r.listing_id as string,
  title: r.title as string,
  due: r.due as string,
  doneAt: r.done_at as string,
  createdAt: r.created_at as string,
});

export const loadTasks = (): Task[] => (db().prepare('SELECT * FROM tasks ORDER BY created_at').all() as Row[]).map(toTask);
export const getTask = (id: string): Task | undefined => {
  const r = db().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined;
  return r ? toTask(r) : undefined;
};
export function saveTask(t: Task): void {
  db()
    .prepare(
      `INSERT INTO tasks (id, listing_id, title, due, done_at, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, due = excluded.due, done_at = excluded.done_at`,
    )
    .run(t.id, t.listingId, t.title, t.due, t.doneAt, t.createdAt);
}
export const deleteTask = (id: string): void => void db().prepare('DELETE FROM tasks WHERE id = ?').run(id);

// ---------- documents ----------

const toDoc = (r: Row): Doc => ({
  id: r.id as string,
  label: r.label as string,
  kind: r.kind as Doc['kind'],
  fileName: r.file_name as string,
  size: Number(r.size),
  createdAt: r.created_at as string,
});

export const loadDocs = (): Doc[] => (db().prepare('SELECT * FROM docs ORDER BY created_at DESC').all() as Row[]).map(toDoc);
export const getDoc = (id: string): Doc | undefined => {
  const r = db().prepare('SELECT * FROM docs WHERE id = ?').get(id) as Row | undefined;
  return r ? toDoc(r) : undefined;
};
export function saveDoc(d: Doc): void {
  db()
    .prepare(
      `INSERT INTO docs (id, label, kind, file_name, size, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label = excluded.label, kind = excluded.kind`,
    )
    .run(d.id, d.label, d.kind, d.fileName, d.size, d.createdAt);
}
/** Remove a document and drop it from every application that listed it. */
export function deleteDoc(id: string): void {
  transaction(db(), () => {
    for (const r of db().prepare("SELECT listing_id, doc_ids FROM state WHERE doc_ids LIKE '%' || ? || '%'").all(id) as Row[]) {
      const ids = json<string[]>(r.doc_ids, []).filter((x) => x !== id);
      db().prepare('UPDATE state SET doc_ids = ? WHERE listing_id = ?').run(JSON.stringify(ids), r.listing_id as string);
    }
    db().prepare('DELETE FROM docs WHERE id = ?').run(id);
  });
}

// ---------- refresh runs ----------

const toRun = (r: Row): RefreshRun => ({
  at: r.at as string,
  added: json(r.added, []),
  closed: json(r.closed, []),
  reopened: json(r.reopened, []),
  changed: json(r.changed, []),
  errors: json(r.errors, []),
});

/** Newest first, like the old runs.json. */
export const loadRuns = (limit = 30): RefreshRun[] =>
  (db().prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?').all(limit) as Row[]).map(toRun);

export function addRun(run: RefreshRun): void {
  db()
    .prepare('INSERT INTO runs (at, added, closed, reopened, changed, errors) VALUES (?, ?, ?, ?, ?, ?)')
    .run(run.at, JSON.stringify(run.added), JSON.stringify(run.closed), JSON.stringify(run.reopened), JSON.stringify(run.changed), JSON.stringify(run.errors));
}

// ---------- settings ----------

export function loadSettings(): Settings {
  const stored = Object.fromEntries((db().prepare('SELECT key, value FROM settings').all() as Row[]).map((r) => [r.key, json(r.value, null)]));
  const merged = { ...DEFAULT_SETTINGS, ...stored } as Settings;
  merged.templates = { ...DEFAULT_SETTINGS.templates, ...(stored.templates as Partial<Settings['templates']> | undefined) };
  return merged;
}

export function saveSettings(s: Settings): void {
  const put = db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  transaction(db(), () => {
    for (const [k, v] of Object.entries(s)) put.run(k, JSON.stringify(v));
  });
}

export function loadDb(): Db {
  return { listings: loadListings(), companies: loadCompanies(), contacts: loadContacts(), tasks: loadTasks(), docs: loadDocs(), state: loadState(), runs: loadRuns(), settings: loadSettings() };
}

// ---------- one-time import of the old JSON files ----------

/** Fill an empty database from data/*.json, then move those files to data/legacy-json/. */
export function importLegacy(target: DatabaseSync, files: NonNullable<ReturnType<typeof readLegacy>>): void {
  const prev = conn;
  conn = target;
  try {
    transaction(target, () => {
      for (const c of (files['companies.json'] as Company[] | undefined) ?? []) upsertCompany(c);
      for (const l of (files['listings.json'] as Listing[] | undefined) ?? []) upsertListing(l);
      for (const [id, raw] of Object.entries((files['state.json'] as Record<string, Partial<ListingState>> | undefined) ?? {})) {
        writeState(id, normalizeState(raw));
      }
      // runs.json is newest first; insert oldest first so ids grow with time.
      for (const r of [...((files['runs.json'] as RefreshRun[] | undefined) ?? [])].reverse()) addRun(r);
      const settings = files['settings.json'] as Partial<Settings> | undefined;
      if (settings) {
        const put = target.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
        for (const [k, v] of Object.entries(settings)) put.run(k, JSON.stringify(v));
      }
    });
  } finally {
    conn = prev;
  }
}

function importLegacyOnce(target: DatabaseSync): void {
  const empty = (target.prepare('SELECT (SELECT count(*) FROM listings) + (SELECT count(*) FROM state) AS n').get() as { n: number }).n === 0;
  if (!empty) return;
  const files = readLegacy();
  if (!files) return;
  importLegacy(target, files);
  retireLegacy();
  console.log('Imported data/*.json into SQLite; originals moved to data/legacy-json/.');
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
