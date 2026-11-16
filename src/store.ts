/** One reactive copy of the database, plus the calls that change it. */
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { ENDINGS, emptyState, today, withStatus } from '../shared/pipeline';
import { celebrate } from './lib/celebrate';
import { STATUSES, type Company, type Db, type Listing, type ListingState, type ManualInput, type Preview, type RefreshProgress, type Settings, type Status, type TrackEvent } from '../shared/types';
import { applyFilters, DEFAULT_FILTERS, effectiveStatus, type Filters } from './filters';
import { buildIndex, search } from './search';

const EMPTY: Db = {
  listings: [],
  companies: [],
  state: {},
  runs: [],
  settings: { introCs: { subject: '', body: '' }, introEn: { subject: '', body: '' }, keywords: [], vueKeywords: [], excludeTitle: '', minSalary: 100000, followUpDays: 7, autoRefresh: true },
};

export const db = reactive<Db>(structuredClone(EMPTY));
export const loaded = ref(false);
export const loadError = ref('');
/** Today as yyyy-mm-dd; ticks over at midnight so due dates stay right in a long-open tab. */
export const todayIso = ref(today());
setInterval(() => (todayIso.value = today()), 60_000);

export const progress = ref<RefreshProgress>({ running: false, step: '', done: 0, total: 0 });

function savedFilters(): Filters {
  try {
    return { ...DEFAULT_FILTERS, ...(JSON.parse(localStorage.getItem('filters') ?? '{}') as Partial<Filters>), query: '' };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}
export const filters = reactive<Filters>(savedFilters());
watch(filters, (f) => {
  try {
    localStorage.setItem('filters', JSON.stringify(f));
  } catch {
    /* private window: filters just do not persist */
  }
});

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function load(): Promise<void> {
  try {
    Object.assign(db, await api<Db>('/db'));
    loaded.value = true;
    loadError.value = '';
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
}

export const companyById = computed(() => new Map<string, Company>(db.companies.map((c) => [c.id, c])));
export const listingById = computed(() => new Map<string, Listing>(db.listings.map((l) => [l.id, l])));
/** Listings added by the most recent refresh that found anything new. */
export const latestAdded = computed(() => new Set(db.runs.find((r) => r.added.length)?.added ?? []));
const index = computed(() => buildIndex(db.listings));
export const hits = computed(() => search(index.value, filters.query));

export const visible = computed(() =>
  applyFilters(db.listings, filters, { state: db.state, companies: companyById.value, latestAdded: latestAdded.value, hits: hits.value }),
);

export const allTags = computed(() => {
  const count = new Map<string, number>();
  for (const l of db.listings) for (const t of l.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
});

export const statusOf = (l: Listing): Status => effectiveStatus(l, db.state[l.id]);

export const statusCounts = computed(() => {
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0])) as Record<Status, number>;
  for (const l of db.listings) counts[statusOf(l)]++;
  return counts;
});

export const stateOf = (id: string): ListingState => db.state[id] ?? emptyState();

type StateChange = Partial<Pick<ListingState, 'status' | 'note' | 'contactedAt' | 'nextAt' | 'nextNote'>>;

export async function setState(id: string, patch: StateChange): Promise<void> {
  // Show the change at once; the server answer then replaces it with what was stored.
  const prev = db.state[id];
  let shown = prev ?? emptyState();
  if (patch.status) shown = withStatus(shown, patch.status, today(), db.settings);
  if (patch.status && patch.status !== prev?.status) celebrate(patch.status);
  db.state[id] = { ...shown, ...patch };
  try {
    db.state[id] = await api<ListingState>(`/state/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });
  } catch (e) {
    if (prev) db.state[id] = prev;
    else delete db.state[id];
    throw e;
  }
}

export async function addEvent(id: string, ev: Omit<TrackEvent, 'id'>): Promise<void> {
  if (ev.kind === 'interview') celebrate('interview');
  db.state[id] = await api<ListingState>(`/state/${encodeURIComponent(id)}/events`, { method: 'POST', body: JSON.stringify(ev) });
}

export async function removeEvent(id: string, eventId: string): Promise<void> {
  db.state[id] = await api<ListingState>(`/state/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
}

export async function followUp(id: string, action: 'done' | 'snooze', days?: number): Promise<void> {
  db.state[id] = await api<ListingState>(`/state/${encodeURIComponent(id)}/followup`, { method: 'POST', body: JSON.stringify({ action, days }) });
}

export const previewUrl = (url: string) => api<Preview>('/listings/preview', { method: 'POST', body: JSON.stringify({ url }) });

/** Add a listing by hand; returns its id. */
export async function addListing(input: ManualInput): Promise<string> {
  const res = await api<{ listing: Listing; company: Company }>('/listings', { method: 'POST', body: JSON.stringify(input) });
  db.listings.push(res.listing);
  const i = db.companies.findIndex((c) => c.id === res.company.id);
  if (i >= 0) db.companies[i] = res.company;
  else db.companies.push(res.company);
  return res.listing.id;
}

export async function deleteListing(id: string): Promise<void> {
  await api(`/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const companyId = db.listings.find((l) => l.id === id)?.companyId;
  db.listings = db.listings.filter((l) => l.id !== id);
  delete db.state[id];
  const c = db.companies.find((x) => x.id === companyId);
  if (c && !c.salary && !c.emails.length && !db.listings.some((l) => l.companyId === c.id)) db.companies = db.companies.filter((x) => x !== c);
}

export async function patchListing(id: string, patch: { fit?: number; recommended?: boolean }): Promise<void> {
  const updated = await api<Listing>(`/listings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const i = db.listings.findIndex((l) => l.id === id);
  if (i >= 0) db.listings[i] = updated;
}

export async function saveSettings(next: Settings): Promise<void> {
  db.settings = await api<Settings>('/settings', { method: 'PUT', body: JSON.stringify(next) });
}

let polling: ReturnType<typeof setInterval> | undefined;

async function poll(): Promise<void> {
  const p = await api<RefreshProgress>('/refresh');
  const wasRunning = progress.value.running;
  progress.value = p;
  if (!p.running) {
    clearInterval(polling);
    polling = undefined;
    if (wasRunning) {
      await load();
      if (p.error) toast.error('Obnovení selhalo', { description: p.error });
      else {
        const run = db.runs[0];
        const added = run?.added.length ?? 0;
        const closed = run?.closed.length ?? 0;
        toast.success('Inzeráty obnoveny', {
          description: added || closed ? `${added} nových · ${closed} uzavřených` : 'Beze změn',
        });
      }
    }
  }
}

export async function startRefresh(): Promise<void> {
  const res = await api<{ started: boolean; progress: RefreshProgress }>('/refresh', { method: 'POST' });
  progress.value = { ...res.progress, running: true };
  polling ??= setInterval(() => void poll(), 1500);
}

/** Pick up a refresh that is already running, for example after a page reload. */
export async function resumeRefresh(): Promise<void> {
  await poll().catch(() => undefined);
  if (progress.value.running) polling ??= setInterval(() => void poll(), 1500);
}

/** Whether the "add by hand" dialog is open; it lives in App so any page can open it. */
export const addOpen = ref(false);

export interface AgendaItem {
  listing: Listing;
  state: ListingState;
}

/** Applications with a planned next step that are still going, soonest first. */
export const planned = computed<AgendaItem[]>(() =>
  db.listings
    .map((listing) => ({ listing, state: db.state[listing.id] }))
    .filter((x): x is AgendaItem => !!x.state?.nextAt && !ENDINGS.includes(statusOf(x.listing)))
    .sort((a, b) => a.state.nextAt.localeCompare(b.state.nextAt)),
);

/** Next steps due today or earlier. */
export const due = computed(() => planned.value.filter((x) => x.state.nextAt <= todayIso.value));

export interface UpcomingInterview {
  listing: Listing;
  event: TrackEvent;
}

export const upcomingInterviews = computed<UpcomingInterview[]>(() =>
  db.listings
    .flatMap((listing) =>
      (db.state[listing.id]?.events ?? []).filter((e) => e.kind === 'interview' && e.at >= todayIso.value).map((event) => ({ listing, event })),
    )
    .sort((a, b) => `${a.event.at} ${a.event.time ?? ''}`.localeCompare(`${b.event.at} ${b.event.time ?? ''}`)),
);
