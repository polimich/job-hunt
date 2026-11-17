/** One reactive copy of the database, plus the calls that change it. */
import { computed, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { ENDINGS, emptyOffer, emptyState, today, withStatus } from '../shared/pipeline';
import { celebrate } from './lib/celebrate';
import { STATUSES, type ApplicationKit, type Company, type Contact, type Db, type Doc, type Offer, type Task, type Listing, type ListingState, type ManualInput, type Preview, type RefreshProgress, type Settings, type Status, type TrackEvent } from '../shared/types';
import { applyFilters, DEFAULT_FILTERS, effectiveStatus, type Filters } from './filters';
import { buildIndex, search } from './search';
import { deckOf, shortlistOf } from '../shared/deck';

const EMPTY: Db = {
  listings: [],
  companies: [],
  contacts: [],
  tasks: [],
  docs: [],
  state: {},
  runs: [],
  summaries: {},
  summaryProfile: '',
  kits: {},
  kitErrors: {},
  research: {},
  settings: { introCs: { subject: '', body: '' }, introEn: { subject: '', body: '' }, keywords: [], location: '', radiusKm: 0, remote: true, postedWithinDays: 14, titleMustMatch: [], excludeWords: [], mpsvCategories: [], level: 'any',
    minSalary: 0,
    followUpDays: 7,
    autoRefresh: true,
    aiSummaries: true,
    wishes: '',
    profile: '',
    startDate: '',
    salaryAsk: '',
    aiKits: true,
    weeklyGoal: 5,
    skills: [],
    sources: {},
    templates: {
      followUp: { cs: { subject: '', body: '' }, en: { subject: '', body: '' } },
      thankYou: { cs: { subject: '', body: '' }, en: { subject: '', body: '' } },
      decline: { cs: { subject: '', body: '' }, en: { subject: '', body: '' } },
    },
  },
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
    const f = { ...DEFAULT_FILTERS, ...(JSON.parse(localStorage.getItem('filters') ?? '{}') as Partial<Filters>), query: '' };
    // Places were renamed in v0.8 (brno/praha → local/jinde); drop values that no longer exist.
    f.places = (f.places ?? []).filter((p) => p === 'local' || p === 'remote' || p === 'jinde');
    return f;
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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    // Server errors come as { error }; show just the message.
    const text = await res.text();
    let msg = text;
    try {
      msg = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      /* plain text */
    }
    throw new Error(msg || String(res.status));
  }
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

// ---------- sorting deck and shortlist ----------

/** Set on the deck page: go through postings without waiting for their AI cards. */
export const deckWithoutAi = ref(false);
/** The summary queue on the server; assumed busy until the first answer, so the deck waits. */
export const summaryQueue = ref<{ running: boolean; pending: number; blocked?: string }>({ running: true, pending: 0 });
/** AI cards are made once summaries are on and the wishes are written. */
export const aiCardsOn = computed(() => db.settings.aiSummaries && !!db.settings.wishes.trim());

export const deck = computed(() =>
  deckOf({
    listings: db.listings,
    state: db.state,
    summaries: db.summaries,
    profile: db.summaryProfile,
    // Nothing is being made (AI off, queue idle or stuck): do not hold cards back.
    includeUnready: deckWithoutAi.value || !aiCardsOn.value || !summaryQueue.value.running,
  }),
);
export const shortlist = computed(() => shortlistOf({ listings: db.listings, state: db.state, summaries: db.summaries }));

/** Fetch the summaries made since the page loaded, and how far the queue is. */
export async function refreshSummaries(): Promise<void> {
  const r = await api<{ summaries: Db['summaries']; profile: string; status: typeof summaryQueue.value }>('/summaries');
  db.summaries = r.summaries;
  db.summaryProfile = r.profile;
  summaryQueue.value = r.status;
}

// ---------- application kits ----------

/** The kit queue on the server: which postings are being prepared right now. */
export const kitQueue = ref<{ running: boolean; ids: string[]; blocked?: string }>({ running: false, ids: [] });
/** Kits are made once they are switched on and my profile is written. */
export const kitsOn = computed(() => db.settings.aiKits && !!db.settings.profile.trim());

type KitsAnswer = Pick<Db, 'kits' | 'kitErrors' | 'research'> & { status: typeof kitQueue.value };

/** Fetch the kits made since the page loaded, and what the queue is doing. */
export async function refreshKits(): Promise<void> {
  const r = await api<KitsAnswer>('/kits');
  db.kits = r.kits;
  db.kitErrors = r.kitErrors;
  db.research = r.research;
  kitQueue.value = r.status;
}

/** Prepare a kit (again), or a CV for the posting; the result arrives through refreshKits. */
export async function requestKit(id: string, what: 'kit' | 'research' | 'cv'): Promise<void> {
  const path = `/listings/${encodeURIComponent(id)}/kit${what === 'cv' ? '/cv' : ''}`;
  kitQueue.value = await api<typeof kitQueue.value>(path, { method: 'POST', body: JSON.stringify({ research: what === 'research' }) });
  delete db.kitErrors[id];
}

export async function saveKit(id: string, patch: Partial<Pick<ApplicationKit, 'email' | 'form' | 'linkedin' | 'cv' | 'done'>>): Promise<void> {
  db.kits[id] = await api<ApplicationKit>(`/listings/${encodeURIComponent(id)}/kit`, { method: 'PUT', body: JSON.stringify(patch) });
}

/** Put a card off: it comes back after the rest of the deck. */
export async function deferListing(id: string): Promise<void> {
  db.state[id] = { ...(db.state[id] ?? emptyState()), deferredAt: new Date().toISOString() };
  db.state[id] = await api<ListingState>(`/state/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ later: true }) });
}

export const stateOf = (id: string): ListingState => db.state[id] ?? emptyState();

type StateChange = Partial<Pick<ListingState, 'status' | 'note' | 'contactedAt' | 'nextAt' | 'nextNote' | 'rating' | 'labels' | 'referredBy' | 'docIds' | 'passReason'>> & {
  offer?: Partial<Offer> | null;
};

export async function setState(id: string, patch: StateChange): Promise<void> {
  // Show the change at once; the server answer then replaces it with what was stored.
  const prev = db.state[id];
  let shown = prev ?? emptyState();
  if (patch.status) shown = withStatus(shown, patch.status, today(), db.settings);
  if (patch.status && patch.status !== prev?.status) celebrate(patch.status);
  const { offer, ...plain } = patch;
  db.state[id] = { ...shown, ...plain, ...(offer === null ? { offer: undefined } : offer ? { offer: { ...emptyOffer(), ...shown.offer, ...offer } } : {}) };
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
  db.tasks = db.tasks.filter((t) => t.listingId !== id);
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
  // New wishes change which AI cards count as ready, and restart the queue.
  await refreshSummaries().catch(() => undefined);
  await refreshKits().catch(() => undefined);
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

// ---------- people ----------

export const contactsOf = (companyId: string) => db.contacts.filter((c) => c.companyId === companyId);
export const contactById = computed(() => new Map(db.contacts.map((c) => [c.id, c])));

export type ContactInput = Partial<Omit<Contact, 'id' | 'createdAt'>>;

export async function saveContact(input: ContactInput & { id?: string }): Promise<Contact> {
  const { id, ...body } = input;
  const saved = id
    ? await api<Contact>(`/contacts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) })
    : await api<Contact>('/contacts', { method: 'POST', body: JSON.stringify(body) });
  const i = db.contacts.findIndex((c) => c.id === saved.id);
  if (i >= 0) db.contacts[i] = saved;
  else db.contacts.push(saved);
  return saved;
}

export async function deleteContact(id: string): Promise<void> {
  await api(`/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  db.contacts = db.contacts.filter((c) => c.id !== id);
  for (const st of Object.values(db.state)) for (const e of st.events) if (e.contactId === id) delete e.contactId;
}

/** Every label in use, most used first. */
export const allLabels = computed(() => {
  const count = new Map<string, number>();
  for (const st of Object.values(db.state)) for (const l of st.labels ?? []) count.set(l, (count.get(l) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
});

// ---------- tasks ----------

export const tasksOf = (listingId: string) => db.tasks.filter((t) => t.listingId === listingId);
/** Open tasks with a date of today or earlier, soonest first. */
export const dueTasks = computed(() =>
  db.tasks.filter((t) => !t.doneAt && t.due && t.due <= todayIso.value).sort((a, b) => a.due.localeCompare(b.due)),
);

function putTask(t: Task) {
  const i = db.tasks.findIndex((x) => x.id === t.id);
  if (i >= 0) db.tasks[i] = t;
  else db.tasks.push(t);
}

export async function addTask(listingId: string, title: string, due: string): Promise<void> {
  putTask(await api<Task>('/tasks', { method: 'POST', body: JSON.stringify({ listingId, title, due }) }));
}

export async function updateTask(id: string, patch: { title?: string; due?: string; done?: boolean }): Promise<void> {
  putTask(await api<Task>(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }));
}

export async function deleteTask(id: string): Promise<void> {
  await api(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  db.tasks = db.tasks.filter((t) => t.id !== id);
}

// ---------- documents ----------

export async function uploadDoc(file: File, label: string, kind: Doc['kind']): Promise<Doc> {
  const form = new FormData();
  form.append('file', file);
  form.append('label', label);
  form.append('kind', kind);
  const res = await fetch('/api/docs', { method: 'POST', body: form });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `${res.status}`);
  const doc = (await res.json()) as Doc;
  db.docs.unshift(doc);
  return doc;
}

export async function renameDoc(id: string, label: string): Promise<void> {
  const doc = await api<Doc>(`/docs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ label }) });
  const i = db.docs.findIndex((d) => d.id === id);
  if (i >= 0) db.docs[i] = doc;
}

export async function deleteDoc(id: string): Promise<void> {
  await api(`/docs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  db.docs = db.docs.filter((d) => d.id !== id);
  for (const st of Object.values(db.state)) st.docIds = (st.docIds ?? []).filter((d) => d !== id);
}

/** Applications with an offer, or at the offer stage. */
export const offers = computed(() =>
  db.listings.filter((l) => {
    const st = db.state[l.id];
    return !!st && (!!st.offer || st.status === 'offer' || st.status === 'accepted');
  }),
);
