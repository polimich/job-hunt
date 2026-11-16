/** Local API for the dashboard. Reads and writes the JSON files in data/. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { addDays, cleanLabels, emptyState, followedUp, newEventId, today, withEvent, withoutEvent, withStatus } from '../shared/pipeline.ts';
import { INTERVIEW_ROUNDS, STATUSES, type Contact, type Doc, type Task, type ListingState, type ManualInput, type Settings, type Status, type TrackEvent } from '../shared/types.ts';
import { manualListing, preview } from './manual.ts';
import { toCsv } from './export.ts';
import { calendar, feed, interviewItem } from './ics.ts';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { backup, listBackups, startDailyJobs } from './snapshot.ts';
import { getProgress, startRefresh } from './refresh.ts';
import { DATA_DIR, deleteCompany, deleteContact, deleteDoc, deleteListing, deleteTask, getDoc, loadDocs, saveDoc, getContact, getState, getTask, saveContact, saveTask, loadCompanies, loadDb, loadListings, loadSettings, putState, saveCompanies, saveListing, saveSettings } from './store.ts';

const app = new Hono();

app.get('/api/db', (c) => c.json(loadDb()));

/** Fields of a state that can be set directly; history goes through the event routes. */
type StateChange = Partial<{ status: Status; note: string; contactedAt: string; nextAt: string; nextNote: string; rating: number; labels: string[]; referredBy: string; docIds: string[] }>;

function updateState(id: string, change: (prev: ListingState, on: string, settings: Settings) => ListingState): ListingState {
  const next = { ...change(getState(id) ?? emptyState(), today(), loadSettings()), updatedAt: new Date().toISOString() };
  putState(id, next);
  return next;
}

const isDate = (v: unknown): v is string => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v));

app.put('/api/state/:id', async (c) => {
  const patch = (await c.req.json()) as StateChange;
  if ('status' in patch && !STATUSES.some((s) => s.id === patch.status)) return c.json({ error: 'unknown status' }, 400);
  if ('contactedAt' in patch && !isDate(patch.contactedAt)) return c.json({ error: 'bad date' }, 400);
  if ('nextAt' in patch && !isDate(patch.nextAt)) return c.json({ error: 'bad date' }, 400);
  return c.json(
    updateState(c.req.param('id'), (prev, on, settings) => {
      let next = patch.status ? withStatus(prev, patch.status, on, settings) : prev;
      if (typeof patch.note === 'string') next = { ...next, note: patch.note };
      if (typeof patch.contactedAt === 'string') next = { ...next, contactedAt: patch.contactedAt };
      if (typeof patch.nextAt === 'string') next = { ...next, nextAt: patch.nextAt, nextNote: patch.nextAt ? (patch.nextNote ?? next.nextNote) : '' };
      else if (typeof patch.nextNote === 'string') next = { ...next, nextNote: patch.nextNote };
      if (typeof patch.rating === 'number') next = { ...next, rating: Math.min(Math.max(Math.round(patch.rating), 0), 5) };
      if (patch.labels !== undefined) next = { ...next, labels: cleanLabels(patch.labels) };
      if (typeof patch.referredBy === 'string') next = { ...next, referredBy: patch.referredBy.trim().slice(0, 120) };
      if (Array.isArray(patch.docIds)) {
        const known = new Set(loadDocs().map((d) => d.id));
        next = { ...next, docIds: [...new Set(patch.docIds.filter((d) => known.has(d)))] };
      }
      return next;
    }),
  );
});

/** Add an entry to the history: a message, an interview or a note. */
app.post('/api/state/:id/events', async (c) => {
  const ev = (await c.req.json()) as Partial<Omit<TrackEvent, 'id'>>;
  if (!ev.kind || !['message', 'interview', 'note'].includes(ev.kind)) return c.json({ error: 'unknown kind' }, 400);
  if (!isDate(ev.at) || !ev.at) return c.json({ error: 'bad date' }, 400);
  const clean: Omit<TrackEvent, 'id'> = { kind: ev.kind, at: ev.at, text: String(ev.text ?? '').slice(0, 4000) };
  if (ev.kind === 'interview' && typeof ev.time === 'string' && /^\d{2}:\d{2}$/.test(ev.time)) clean.time = ev.time;
  if (typeof ev.contactId === 'string' && getContact(ev.contactId)) clean.contactId = ev.contactId;
  if (ev.kind === 'interview' && INTERVIEW_ROUNDS.some((r) => r.id === ev.round)) clean.round = ev.round;
  return c.json(updateState(c.req.param('id'), (prev, on, settings) => withEvent(prev, clean, on, settings)));
});

app.delete('/api/state/:id/events/:eventId', (c) =>
  c.json(updateState(c.req.param('id'), (prev) => withoutEvent(prev, c.req.param('eventId')))),
);

/** Follow-up actions from the "Dnes" page. */
app.post('/api/state/:id/followup', async (c) => {
  const { action, days } = (await c.req.json()) as { action: 'done' | 'snooze'; days?: number };
  if (action === 'done') return c.json(updateState(c.req.param('id'), (prev, on, settings) => followedUp(prev, on, settings)));
  if (action === 'snooze') {
    const n = Math.min(Math.max(Math.round(days ?? 3), 1), 60);
    return c.json(updateState(c.req.param('id'), (prev, on) => ({ ...prev, nextAt: addDays(on, n) })));
  }
  return c.json({ error: 'unknown action' }, 400);
});

/** Read title, company and text from a pasted posting URL, to prefill the add form. */
app.post('/api/listings/preview', async (c) => {
  const { url } = (await c.req.json()) as { url?: string };
  if (!url || !/^https?:\/\//i.test(url)) return c.json({ error: 'bad url' }, 400);
  return c.json(await preview(url));
});

/** Add a listing by hand. */
app.post('/api/listings', async (c) => {
  const input = (await c.req.json()) as ManualInput;
  if (!input.title?.trim() || !input.company?.trim()) return c.json({ error: 'title and company are required' }, 400);
  const listings = loadListings();
  const companies = loadCompanies();
  const listing = manualListing(input, companies, today());
  if (listings.some((l) => l.id === listing.id)) return c.json({ error: 'Tahle pozice už v seznamu je', id: listing.id }, 409);
  saveCompanies(companies);
  saveListing(listing);
  return c.json({ listing, company: companies.find((x) => x.id === listing.companyId) });
});

/** Remove a listing that was added by hand, with its state. */
app.delete('/api/listings/:id', (c) => {
  const id = c.req.param('id');
  const listings = loadListings();
  const listing = listings.find((l) => l.id === id);
  if (!listing) return c.json({ error: 'not found' }, 404);
  if (!listing.manual) return c.json({ error: 'only listings added by hand can be deleted' }, 400);
  deleteListing(id);
  // Drop the company too if this listing created it and nothing else uses it.
  const company = loadCompanies().find((x) => x.id === listing.companyId);
  if (company && !company.salary && !company.emails.length && !listings.some((l) => l.id !== id && l.companyId === company.id)) {
    deleteCompany(company.id);
  }
  return c.json({ ok: true });
});

/** Override the match score or the recommendation of one listing by hand. */
app.patch('/api/listings/:id', async (c) => {
  const patch = (await c.req.json()) as { fit?: number; recommended?: boolean };
  const listings = loadListings();
  const listing = listings.find((l) => l.id === c.req.param('id'));
  if (!listing) return c.json({ error: 'not found' }, 404);
  if (typeof patch.fit === 'number' && patch.fit >= 1 && patch.fit <= 5) listing.fit = Math.round(patch.fit);
  if (typeof patch.recommended === 'boolean') listing.recommended = patch.recommended;
  saveListing(listing);
  return c.json(listing);
});

app.put('/api/settings', async (c) => {
  const next: Settings = { ...loadSettings(), ...((await c.req.json()) as Partial<Settings>) };
  if (next.excludeTitle) {
    try {
      new RegExp(next.excludeTitle);
    } catch {
      return c.json({ error: 'excludeTitle is not a valid regular expression' }, 400);
    }
  }
  next.followUpDays = Math.min(Math.max(Math.round(Number(next.followUpDays) || 7), 1), 60);
  next.autoRefresh = next.autoRefresh !== false;
  next.weeklyGoal = Math.min(Math.max(Math.round(Number(next.weeklyGoal) || 5), 1), 50);
  saveSettings(next);
  return c.json(next);
});

const CONTACT_FIELDS = ['name', 'role', 'email', 'phone', 'linkedin', 'note'] as const;

function contactFrom(input: Partial<Contact>, prev?: Contact): Contact | string {
  const c: Contact = prev ? { ...prev } : { id: newEventId(), companyId: '', name: '', role: '', email: '', phone: '', linkedin: '', note: '', createdAt: new Date().toISOString() };
  for (const f of CONTACT_FIELDS) if (typeof input[f] === 'string') c[f] = input[f].trim().slice(0, f === 'note' ? 2000 : 200);
  if (typeof input.companyId === 'string') c.companyId = input.companyId;
  if (!c.name) return 'name is required';
  if (!loadCompanies().some((x) => x.id === c.companyId)) return 'unknown company';
  return c;
}

app.post('/api/contacts', async (c) => {
  const next = contactFrom((await c.req.json()) as Partial<Contact>);
  if (typeof next === 'string') return c.json({ error: next }, 400);
  saveContact(next);
  return c.json(next);
});

app.patch('/api/contacts/:id', async (c) => {
  const prev = getContact(c.req.param('id'));
  if (!prev) return c.json({ error: 'not found' }, 404);
  const next = contactFrom((await c.req.json()) as Partial<Contact>, prev);
  if (typeof next === 'string') return c.json({ error: next }, 400);
  saveContact(next);
  return c.json(next);
});

app.delete('/api/contacts/:id', (c) => {
  deleteContact(c.req.param('id'));
  return c.json({ ok: true });
});

const isDay = (v: unknown): v is string => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v));

app.post('/api/tasks', async (c) => {
  const body = (await c.req.json()) as Partial<Task>;
  const title = String(body.title ?? '').trim().slice(0, 300);
  if (!title) return c.json({ error: 'title is required' }, 400);
  if (!loadListings().some((l) => l.id === body.listingId)) return c.json({ error: 'unknown listing' }, 400);
  if (!isDay(body.due ?? '')) return c.json({ error: 'bad date' }, 400);
  const task: Task = { id: newEventId(), listingId: body.listingId!, title, due: body.due ?? '', doneAt: '', createdAt: new Date().toISOString() };
  saveTask(task);
  return c.json(task);
});

app.patch('/api/tasks/:id', async (c) => {
  const prev = getTask(c.req.param('id'));
  if (!prev) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json()) as { title?: string; due?: string; done?: boolean };
  const next = { ...prev };
  if (typeof body.title === 'string' && body.title.trim()) next.title = body.title.trim().slice(0, 300);
  if (body.due !== undefined) {
    if (!isDay(body.due)) return c.json({ error: 'bad date' }, 400);
    next.due = body.due;
  }
  if (typeof body.done === 'boolean') next.doneAt = body.done ? new Date().toISOString() : '';
  saveTask(next);
  return c.json(next);
});

app.delete('/api/tasks/:id', (c) => {
  deleteTask(c.req.param('id'));
  return c.json({ ok: true });
});

// ---------- documents (CV versions…) ----------

const DOCS_DIR = join(DATA_DIR, 'docs');
const DOC_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const docPath = (d: Doc) => join(DOCS_DIR, `${d.id}${extname(d.fileName).toLowerCase()}`);

app.post('/api/docs', async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: 'file is required' }, 400);
  const ext = extname(file.name).toLowerCase();
  if (!DOC_TYPES[ext]) return c.json({ error: 'Povolené jsou PDF, DOC(X), ODT, MD a TXT' }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'Soubor je větší než 10 MB' }, 400);
  const kind = ['cv', 'cover', 'other'].includes(String(body.kind)) ? (String(body.kind) as Doc['kind']) : 'cv';
  const doc: Doc = {
    id: newEventId(),
    label: String(body.label ?? '').trim().slice(0, 120) || file.name.replace(/\.[^.]+$/, ''),
    kind,
    fileName: file.name.replace(/[\/\\]/g, '_').slice(0, 200),
    size: file.size,
    createdAt: new Date().toISOString(),
  };
  mkdirSync(DOCS_DIR, { recursive: true });
  writeFileSync(docPath(doc), Buffer.from(await file.arrayBuffer()));
  saveDoc(doc);
  return c.json(doc);
});

app.get('/api/docs/:id', (c) => {
  const doc = getDoc(c.req.param('id'));
  if (!doc) return c.json({ error: 'not found' }, 404);
  c.header('Content-Type', DOC_TYPES[extname(doc.fileName).toLowerCase()] ?? 'application/octet-stream');
  c.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);
  return c.body(readFileSync(docPath(doc)));
});

app.patch('/api/docs/:id', async (c) => {
  const doc = getDoc(c.req.param('id'));
  if (!doc) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json()) as Partial<Doc>;
  if (typeof body.label === 'string' && body.label.trim()) doc.label = body.label.trim().slice(0, 120);
  if (body.kind && ['cv', 'cover', 'other'].includes(body.kind)) doc.kind = body.kind;
  saveDoc(doc);
  return c.json(doc);
});

app.delete('/api/docs/:id', (c) => {
  const doc = getDoc(c.req.param('id'));
  if (!doc) return c.json({ ok: true });
  deleteDoc(doc.id);
  rmSync(docPath(doc), { force: true });
  return c.json({ ok: true });
});

// ---------- calendar ----------

/** Subscribe to this in a calendar app (webcal://localhost:5174/calendar.ics). */
app.get('/calendar.ics', (c) => {
  c.header('Content-Type', 'text/calendar; charset=utf-8');
  return c.body(feed(loadDb()));
});

/** One interview, to add to a calendar by opening the file. */
app.get('/api/state/:id/events/:eventId/ics', (c) => {
  const st = getState(c.req.param('id'));
  const ev = st?.events.find((e) => e.id === c.req.param('eventId') && e.kind === 'interview');
  const l = loadListings().find((x) => x.id === c.req.param('id'));
  if (!ev || !l) return c.json({ error: 'not found' }, 404);
  c.header('Content-Type', 'text/calendar; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="pohovor-${l.companyId}.ics"`);
  return c.body(calendar([interviewItem(l, ev, ev.contactId ? getContact(ev.contactId)?.name : undefined)]));
});

/** Everything, as one JSON file (backup / moving to another machine). */
app.get('/api/export.json', (c) => {
  c.header('Content-Disposition', `attachment; filename="job-hunt-${today()}.json"`);
  return c.json(loadDb());
});

/** Applications as CSV for a spreadsheet. */
app.get('/api/export.csv', (c) => {
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="job-hunt-${today()}.csv"`);
  return c.body(toCsv(loadDb()));
});

app.get('/api/backups', (c) => c.json(listBackups()));
app.post('/api/backups', (c) => c.json({ file: backup(today(), true) }));

app.post('/api/refresh', (c) => c.json({ started: startRefresh(), progress: getProgress() }));
app.get('/api/refresh', (c) => c.json(getProgress()));

// `pnpm start` serves the built app from dist/ on the same port.
const dist = join(DATA_DIR, '..', 'dist');
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

const port = Number(process.env.PORT ?? 5174);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`job-hunt API on http://localhost:${port}`);
  startDailyJobs();
});
