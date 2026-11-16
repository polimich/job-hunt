/**
 * Pure rules for moving an application through the pipeline: status changes, history,
 * follow-up dates. Used by the server to store changes and by the app to show them at once.
 */
import type { ListingState, Status, TrackEvent } from './types.ts';

/** Position in the forward pipeline; endings have no rank of their own. */
export const RANK: Partial<Record<Status, number>> = {
  new: 0,
  interested: 1,
  applied: 2,
  talking: 3,
  interview: 4,
  offer: 5,
  accepted: 6,
};

/** Waiting on something: these are the applications that need follow-ups. */
export const ACTIVE: Status[] = ['applied', 'talking', 'interview', 'offer'];
export const ENDINGS: Status[] = ['accepted', 'passed', 'rejected', 'ghosted', 'closed'];

export const today = (d = new Date()): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both yyyy-mm-dd); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export const newEventId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function emptyState(): ListingState {
  return { status: 'new', note: '', contactedAt: '', nextAt: '', nextNote: '', followUps: 0, rating: 0, labels: [], referredBy: '', docIds: [], events: [], updatedAt: '' };
}

const LEGACY_STATUS: Record<string, Status> = { contacted: 'applied', rejected: 'passed' };

/**
 * Bring a stored record up to the current shape. Records written before the history existed
 * have no `events`; in those, 'contacted' meant applied and 'rejected' meant "I don't want it".
 */
export function normalizeState(raw: Partial<ListingState> & { status?: string }): ListingState {
  const legacy = !Array.isArray(raw.events);
  const status = (legacy ? (LEGACY_STATUS[raw.status ?? ''] ?? raw.status) : raw.status) as Status | undefined;
  return { ...emptyState(), ...raw, status: status ?? 'new', events: raw.events ?? [] };
}

export interface PipelineSettings {
  followUpDays: number;
}

/** The reminder that goes with arriving at a status, or none. */
function reminderFor(status: Status, on: string, s: PipelineSettings): Pick<ListingState, 'nextAt' | 'nextNote'> {
  if (status === 'applied') return { nextAt: addDays(on, s.followUpDays), nextNote: 'Připomenout se, pokud se neozvali' };
  if (status === 'talking') return { nextAt: addDays(on, 5), nextNote: 'Ozvat se, domluvit další krok' };
  if (status === 'interview') return { nextAt: addDays(on, 5), nextNote: 'Zeptat se na výsledek pohovoru' };
  if (status === 'offer') return { nextAt: addDays(on, 3), nextNote: 'Rozhodnout o nabídce' };
  return { nextAt: '', nextNote: '' };
}

export function withStatus(prev: ListingState, status: Status, on: string, s: PipelineSettings): ListingState {
  if (prev.status === status) return prev;
  const next: ListingState = {
    ...prev,
    status,
    events: [...prev.events, { id: newEventId(), kind: 'status', at: on, status, text: '' }],
    ...reminderFor(status, on, s),
  };
  // Any step forward from "applied" means they answered, so the follow-up count starts over.
  if ((RANK[status] ?? 0) > (RANK.applied ?? 0)) next.followUps = 0;
  if ((RANK[status] ?? 0) >= (RANK.applied ?? 0) && !prev.contactedAt) next.contactedAt = on;
  return next;
}

export function withEvent(prev: ListingState, ev: Omit<TrackEvent, 'id'>, on: string, s: PipelineSettings): ListingState {
  let next: ListingState = { ...prev, events: [...prev.events, { ...ev, id: newEventId() }] };
  if (ev.kind === 'interview') {
    // Scheduling an interview moves the application to "interview" if it was behind.
    if ((RANK[next.status] ?? -1) < (RANK.interview ?? 0) && !ENDINGS.includes(next.status)) next = withStatus(next, 'interview', on, s);
    // Thank-you and next step the day after the interview.
    next = { ...next, nextAt: addDays(ev.at, 1), nextNote: 'Poděkovat za pohovor, zeptat se na další krok' };
  }
  return next;
}

export function withoutEvent(prev: ListingState, eventId: string): ListingState {
  return { ...prev, events: prev.events.filter((e) => e.id !== eventId) };
}

/** I sent a follow-up: log it and plan the next one. */
export function followedUp(prev: ListingState, on: string, s: PipelineSettings): ListingState {
  return {
    ...prev,
    followUps: prev.followUps + 1,
    events: [...prev.events, { id: newEventId(), kind: 'message', at: on, text: 'Připomenul(a) jsem se' }],
    nextAt: addDays(on, s.followUpDays),
    nextNote: prev.followUps + 1 >= 2 ? 'Pořád nic? Označit jako bez odpovědi' : 'Připomenout se znovu',
  };
}

/** After two unanswered follow-ups an application is probably ghosted. */
export const looksGhosted = (st: ListingState) => (st.status === 'applied' || st.status === 'talking') && st.followUps >= 2;

/** Furthest forward stage an application reached, from its history and its current status. */
export function furthestRank(st: ListingState): number {
  let best = RANK[st.status] ?? 0;
  for (const e of st.events) if (e.kind === 'status' && e.status) best = Math.max(best, RANK[e.status] ?? 0);
  if (st.contactedAt) best = Math.max(best, RANK.applied ?? 0);
  if (st.events.some((e) => e.kind === 'interview')) best = Math.max(best, RANK.interview ?? 0);
  return best;
}

/** Clean user labels: trimmed, lower-case, unique, at most 12 of up to 24 characters. */
export function cleanLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const l = String(v).trim().toLowerCase().slice(0, 24);
    if (l && !out.includes(l)) out.push(l);
  }
  return out.slice(0, 12);
}
