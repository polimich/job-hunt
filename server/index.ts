/** Local API for the dashboard, over the SQLite database in data/. */
import './env.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { addDays, cleanLabels, emptyOffer, emptyState, ENDINGS, followedUp, newEventId, normalizeState, RANK, today, withEvent, withoutEvent, withStatus } from '../shared/pipeline.ts';
import { INTERVIEW_ROUNDS, PASS_REASONS, STATUSES, type Contact, type Doc, type Offer, type Task, type ListingState, type EmailTemplateKind, type Level, type ManualInput, type Settings, type Status, type TrackEvent } from '../shared/types.ts';
import { placeOf } from '../shared/search.ts';
import { manualListing, preview } from './manual.ts';
import { toCsv } from './export.ts';
import { sourceInfo } from './sources/index.ts';
import { calendar, feed, interviewItem } from './ics.ts';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { backup, listBackups, startDailyJobs } from './snapshot.ts';
import { guard } from './guard.ts';
import { auth, calendarToken } from './auth.ts';
import { queueSummaries, summarizeNow, summaryStatus } from './summary-queue.ts';
import { profileHash } from './summary.ts';
import { kitsOn, kitStatus, queueKits, requestKit } from './kit-queue.ts';
import { kitSteps, normalizeKit, profileFromCv } from './kit.ts';
import * as chat from './chat.ts';
import { getProgress, startRefresh } from './refresh.ts';
import { DATA_DIR, deleteCompany, deleteContact, deleteDoc, deleteListing, deleteTask, getDoc, loadDocs, saveDoc, getContact, getState, getTask, saveContact, saveTask, loadCompanies, loadDb, loadListings, loadSettings, DOCS_DIR, DOC_TYPES, docPath, putState, getSummary, getKit, loadKits, loadResearch, saveKit, loadSummaries, replaceDb, saveCompanies, saveListing, saveListings, saveSettings } from './store.ts';

const port = Number(process.env.PORT ?? 5174);
const app = new Hono();
app.use('*', guard(port));
app.use('*', auth(process.env.APP_PASSWORD || undefined));

app.get('/api/db', (c) => c.json({ ...loadDb(), summaryProfile: profileHash(loadSettings()) }));

/** Fields of a state that can be set directly; history goes through the event routes. */
type StateChange = Partial<{ passReason: string; later: boolean; status: Status; note: string; contactedAt: string; nextAt: string; nextNote: string; rating: number; labels: string[]; referredBy: string; docIds: string[]; offer: Partial<Offer> | null }>;

function updateState(id: string, change: (prev: ListingState, on: string, settings: Settings) => ListingState): ListingState {
  const next = { ...change(getState(id) ?? emptyState(), today(), loadSettings()), updatedAt: new Date().toISOString() };
  putState(id, next);
  return next;
}

function cleanOffer(o: Offer): Offer {
  const text = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n);
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const num = (v: unknown, max: number) => Math.min(Math.max(Math.round(Number(v) || 0), 0), max);
  return {
    salary: num(o.salary, 10_000_000),
    bonus: text(o.bonus),
    remote: text(o.remote, 60),
    vacation: num(o.vacation, 100),
    contract: text(o.contract, 60),
    start: day(o.start),
    deadline: day(o.deadline),
    note: text(o.note, 2000),
  };
}

const isDate = (v: unknown): v is string => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v));

app.put('/api/state/:id', async (c) => {
  const patch = (await c.req.json()) as StateChange;
  if ('status' in patch && !STATUSES.some((s) => s.id === patch.status)) return c.json({ error: 'unknown status' }, 400);
  if ('contactedAt' in patch && !isDate(patch.contactedAt)) return c.json({ error: 'bad date' }, 400);
  if ('nextAt' in patch && !isDate(patch.nextAt)) return c.json({ error: 'bad date' }, 400);
  const saved = updateState(c.req.param('id'), (prev, on, settings) => {
      let next = patch.status ? withStatus(prev, patch.status, on, settings) : prev;
      if (typeof patch.note === 'string') next = { ...next, note: patch.note };
      // Sorting deck: why I passed, and "later" (true puts the card last, false takes that back).
      if (typeof patch.passReason === 'string' && next.status === 'passed') next = { ...next, passReason: PASS_REASONS.some((r) => r.id === patch.passReason) ? patch.passReason : '' };
      if (typeof patch.later === 'boolean') next = { ...next, deferredAt: patch.later && next.status === 'new' ? new Date().toISOString() : '' };
      if (typeof patch.contactedAt === 'string') next = { ...next, contactedAt: patch.contactedAt };
      if (typeof patch.nextAt === 'string') next = { ...next, nextAt: patch.nextAt, nextNote: patch.nextAt ? (patch.nextNote ?? next.nextNote) : '' };
      else if (typeof patch.nextNote === 'string') next = { ...next, nextNote: patch.nextNote };
      if (typeof patch.rating === 'number') next = { ...next, rating: Math.min(Math.max(Math.round(patch.rating), 0), 5) };
      if (patch.labels !== undefined) next = { ...next, labels: cleanLabels(patch.labels) };
      if (typeof patch.referredBy === 'string') next = { ...next, referredBy: patch.referredBy.trim().slice(0, 120) };
      if (patch.offer === null) next = { ...next, offer: undefined };
      else if (patch.offer && typeof patch.offer === 'object') next = { ...next, offer: cleanOffer({ ...(next.offer ?? emptyOffer()), ...patch.offer }) };
      if (Array.isArray(patch.docIds)) {
        const known = new Set(loadDocs().map((d) => d.id));
        next = { ...next, docIds: [...new Set(patch.docIds.filter((d) => known.has(d)))] };
      }
      return next;
    });
  // A posting I just shortlisted gets its application kit prepared in the background.
  if (patch.status === 'interested') queueKits();
  return c.json(saved);
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

/**
 * I opened an e-mail from the app in my mail program: log it. An intro is the application,
 * a follow-up counts as one, anything else is a message in the history.
 */
app.post('/api/state/:id/emailed', async (c) => {
  const { kind, subject, docIds } = (await c.req.json()) as { kind?: EmailTemplateKind; subject?: string; docIds?: string[] };
  const text = `📤 ${String(subject ?? '').trim().slice(0, 300) || 'E-mail'}`;
  const docs = (Array.isArray(docIds) ? docIds : []).map(String).filter((id) => getDoc(id));
  return c.json(
    updateState(c.req.param('id'), (prev, on, settings) => {
      let st = prev;
      if (kind === 'followUp') {
        st = followedUp(st, on, settings);
        st.events[st.events.length - 1] = { ...st.events.at(-1)!, text: text.replace('📤 ', '📤 Připomenutí: ') };
      } else {
        st = withEvent(st, { kind: 'message', at: on, text }, on, settings);
        if (kind === 'intro' && (RANK[st.status] ?? 0) < (RANK.applied ?? 0) && !ENDINGS.includes(st.status)) st = withStatus(st, 'applied', on, settings);
      }
      return { ...st, docIds: [...new Set([...st.docIds, ...docs])] };
    }),
  );
});

/** Undo: put back a state the app had a moment ago (after logging an e-mail by mistake). */
app.put('/api/state/:id/restore', async (c) => {
  const prev = normalizeState((await c.req.json()) as ListingState);
  return c.json(updateState(c.req.param('id'), () => prev));
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
  const listing = manualListing(input, companies, today(), loadSettings());
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

const LEVELS: Level[] = ['any', 'junior', 'medior', 'senior', 'lead'];
const words = (v: unknown, max: number) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, max) : [];

app.put('/api/settings', async (c) => {
  const prev = loadSettings();
  const next: Settings = { ...prev, ...((await c.req.json()) as Partial<Settings>) };
  next.keywords = words(next.keywords, 12);
  next.location = String(next.location ?? '').trim().slice(0, 60);
  next.radiusKm = Math.min(Math.max(Math.round(Number(next.radiusKm) || 0), 0), 100);
  next.remote = next.remote !== false;
  next.postedWithinDays = Math.min(Math.max(Math.round(Number(next.postedWithinDays) || 0), 0), 90);
  next.titleMustMatch = words(next.titleMustMatch, 60);
  next.excludeWords = words(next.excludeWords, 100);
  next.mpsvCategories = words(next.mpsvCategories, 20).filter((g) => /^\d{1,4}$/.test(g));
  next.level = LEVELS.includes(next.level) ? next.level : 'any';
  next.followUpDays = Math.min(Math.max(Math.round(Number(next.followUpDays) || 7), 1), 60);
  next.autoRefresh = next.autoRefresh !== false;
  next.aiSummaries = next.aiSummaries !== false;
  next.wishes = String(next.wishes ?? '').trim().slice(0, 3000);
  next.profile = String(next.profile ?? '').trim().slice(0, 12_000);
  next.startDate = String(next.startDate ?? '').trim().slice(0, 200);
  next.salaryAsk = String(next.salaryAsk ?? '').trim().slice(0, 200);
  next.aiKits = next.aiKits !== false;
  next.weeklyGoal = Math.min(Math.max(Math.round(Number(next.weeklyGoal) || 5), 1), 50);
  next.skills = words(next.skills, 60);
  saveSettings(next);
  // "Local" means the search town, so a new town re-sorts what is already in the list.
  if (next.location !== prev.location) {
    const listings = loadListings();
    for (const l of listings) if (!l.manual) l.place = placeOf(l.location, l.mode === 'neuvedeno' ? '' : l.mode, next.location);
    saveListings(listings);
  }
  // New wishes or profile: cards I have not decided on are judged again.
  if (profileHash(next) !== profileHash(prev) || next.aiSummaries !== prev.aiSummaries) queueSummaries();
  // My profile is written (or kits switched on): prepare what is on the shortlist.
  if (kitsOn(next) && !kitsOn(prev)) queueKits();
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

/** Where a calendar app can subscribe: with a token when the app is behind a login. */
app.get('/api/calendar-url', (c) => {
  const pw = process.env.APP_PASSWORD;
  return c.json({ path: pw ? `/calendar.ics?token=${calendarToken(pw)}` : '/calendar.ics', login: !!pw });
});

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

app.get('/api/sources', (c) => c.json(sourceInfo(loadSettings())));

app.get('/api/backups', (c) => c.json(listBackups()));

/** Replace the whole database with an uploaded file (moving to another machine, or a backup). */
app.post('/api/restore', async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: 'chybí soubor' }, 400);
  const tmp = join(DATA_DIR, `upload-${Date.now()}.db`);
  writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
  try {
    return c.json({ ok: true, previous: replaceDb(tmp) });
  } catch (e) {
    rmSync(tmp, { force: true });
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
app.post('/api/backups', (c) => c.json({ file: backup(today(), true) }));

app.get('/api/summaries/status', (c) => c.json(summaryStatus()));
/** All summaries with the queue's progress; the sorting deck polls this while cards are made. */
app.get('/api/summaries', (c) => c.json({ summaries: loadSummaries(), profile: profileHash(loadSettings()), status: summaryStatus() }));
app.get('/api/listings/:id/summary', (c) => c.json(getSummary(c.req.param('id'))));
/** Make (or remake) one summary now; takes about 10 seconds. */
app.post('/api/listings/:id/summary', async (c) => c.json(await summarizeNow(c.req.param('id'))));

// ---------- application kits ----------

const kitsNow = () => ({ ...loadKits(), research: loadResearch(), status: kitStatus() });

app.get('/api/kits', (c) => c.json(kitsNow()));

/** Prepare the kit (again); `research` also searches the web again. Answers at once, the work runs in the queue. */
app.post('/api/listings/:id/kit', async (c) => {
  const id = c.req.param('id');
  if (!loadListings().some((l) => l.id === id)) return c.json({ error: 'not found' }, 404);
  if (!loadSettings().profile.trim()) return c.json({ error: 'Nejdřív vyplň „Můj profil“ v Nastavení.' }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { research?: boolean };
  return c.json(requestKit({ id, kind: 'kit', fresh: body.research === true }));
});

/** Write a CV for this posting from my profile and the advice as I edited it. */
app.post('/api/listings/:id/kit/cv', (c) => {
  const id = c.req.param('id');
  if (!getKit(id)) return c.json({ error: 'Nejdřív připrav přihlášku.' }, 400);
  return c.json(requestKit({ id, kind: 'cv' }));
});

/** Save my edits of the drafts and the steps I ticked off. */
app.put('/api/listings/:id/kit', async (c) => {
  const id = c.req.param('id');
  const prev = getKit(id);
  if (!prev) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json()) as Record<string, unknown>;
  const edit = normalizeKit({ ...prev, ...body });
  const next = { ...prev, email: edit.email, form: edit.form, linkedin: edit.linkedin, cv: edit.cv, done: 'done' in body ? kitSteps(body.done) : prev.done };
  saveKit(id, next);
  return c.json(next);
});

/** Text of an uploaded CV as a first version of "My profile". */
app.post('/api/profile/from-cv', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { docId?: string };
  const doc = body.docId ? getDoc(body.docId) : undefined;
  if (!doc) return c.json({ error: 'Dokument nenalezen.' }, 404);
  if (!['.pdf', '.md', '.txt'].includes(extname(doc.fileName).toLowerCase())) return c.json({ error: 'Umím číst jen PDF, MD a TXT.' }, 400);
  try {
    const profile = await profileFromCv(docPath(doc));
    return profile ? c.json({ profile }) : c.json({ error: 'Soubor se nepodařilo přečíst.' }, 422);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ---------- interview preparation chat ----------

/** Chat calls answer with the state, or with the reason they cannot run. */
const chatCall = (fn: () => chat.ChatState): Response => {
  try {
    return Response.json(fn());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
};
const jsonBody = async (c: { req: { json: () => Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

app.get('/api/listings/:id/chat', (c) => chatCall(() => chat.chatState(c.req.param('id'))));
app.post('/api/listings/:id/chat', async (c) => {
  const body = await jsonBody(c);
  return chatCall(() => chat.send(c.req.param('id'), body));
});
app.put('/api/listings/:id/chat', async (c) => {
  const body = await jsonBody(c);
  return chatCall(() => chat.setLang(c.req.param('id'), body.lang));
});
app.delete('/api/listings/:id/chat', (c) => chatCall(() => chat.clear(c.req.param('id'))));
app.post('/api/listings/:id/chat/stop', (c) => chatCall(() => chat.stop(c.req.param('id'))));
app.post('/api/listings/:id/chat/retry', async (c) => {
  const body = await jsonBody(c);
  return chatCall(() => chat.retry(c.req.param('id'), body.model));
});
app.post('/api/listings/:id/chat/sheet', (c) => chatCall(() => chat.updateSheet(c.req.param('id'))));
app.put('/api/listings/:id/chat/sheet', async (c) => {
  const body = await jsonBody(c);
  return chatCall(() => chat.saveSheet(c.req.param('id'), body));
});

app.post('/api/refresh', (c) => c.json({ started: startRefresh(), progress: getProgress() }));
app.get('/api/refresh', (c) => c.json(getProgress()));

// `pnpm start` serves the built app from dist/ on the same port.
const dist = join(DATA_DIR, '..', 'dist');
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

// HOST=0.0.0.0 in a container; locally only this machine can connect.
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, () => {
  console.log(`job-hunt API on http://localhost:${port}`);
  startDailyJobs();
});
