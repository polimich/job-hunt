/** Local API for the dashboard. Reads and writes the JSON files in data/. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { addDays, emptyState, followedUp, today, withEvent, withoutEvent, withStatus } from '../shared/pipeline.ts';
import { STATUSES, type ListingState, type ManualInput, type Settings, type Status, type TrackEvent } from '../shared/types.ts';
import { manualListing, preview } from './manual.ts';
import { startDailyJobs } from './snapshot.ts';
import { getProgress, startRefresh } from './refresh.ts';
import { DATA_DIR, loadCompanies, loadDb, loadListings, loadSettings, loadState, saveCompanies, saveListings, saveSettings, saveState } from './store.ts';

const app = new Hono();

app.get('/api/db', (c) => c.json(loadDb()));

/** Fields of a state that can be set directly; history goes through the event routes. */
type StateChange = Partial<{ status: Status; note: string; contactedAt: string; nextAt: string; nextNote: string }>;

function updateState(id: string, change: (prev: ListingState, on: string, settings: Settings) => ListingState): ListingState {
  const state = loadState();
  const next = { ...change(state[id] ?? emptyState(), today(), loadSettings()), updatedAt: new Date().toISOString() };
  state[id] = next;
  saveState(state);
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
  listings.push(listing);
  saveCompanies(companies);
  saveListings(listings);
  return c.json({ listing, company: companies.find((x) => x.id === listing.companyId) });
});

/** Remove a listing that was added by hand, with its state. */
app.delete('/api/listings/:id', (c) => {
  const id = c.req.param('id');
  const listings = loadListings();
  const listing = listings.find((l) => l.id === id);
  if (!listing) return c.json({ error: 'not found' }, 404);
  if (!listing.manual) return c.json({ error: 'only listings added by hand can be deleted' }, 400);
  const rest = listings.filter((l) => l.id !== id);
  saveListings(rest);
  // Drop the company too if this listing created it and nothing else uses it.
  const companies = loadCompanies();
  const company = companies.find((x) => x.id === listing.companyId);
  if (company && !company.salary && !company.emails.length && !rest.some((l) => l.companyId === company.id)) {
    saveCompanies(companies.filter((x) => x !== company));
  }
  const state = loadState();
  delete state[id];
  saveState(state);
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
  saveListings(listings);
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
  saveSettings(next);
  return c.json(next);
});

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
