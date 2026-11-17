/**
 * Background queue that keeps an AI summary (the sorting card) for every open posting that is
 * still in play. Runs after each refresh, after the wishes change, and every half hour. Three
 * postings at a time, best match first, so the best cards are ready first. A problem that
 * affects every call (not logged in, limit reached, CLI missing) pauses the queue instead of
 * marking each posting as failed.
 */
import { ENDINGS } from '../shared/pipeline.ts';
import { PASS_REASONS, type Listing, type ListingState, type Settings } from '../shared/types.ts';
import { getSummary, loadListings, loadSettings, loadState, saveSummary, saveSummaryError, summaryAttempts } from './store.ts';
import { profileHash, summarize, summaryHash, type Rejection } from './summary.ts';

export interface SummaryStatus {
  running: boolean;
  pending: number;
  /** Why the queue stopped, when it affects all postings. */
  blocked?: string;
}

const WORKERS = 3;
let active = 0;
let blocked: string | undefined;
const queue: string[] = [];

export const summaryStatus = (): SummaryStatus => ({ running: active > 0, pending: queue.length + active, blocked });

const GLOBAL = /not logged in|log ?in|authenticat|oauth|token|credit|usage limit|rate limit|limit reached|quota|overloaded|401|403|429|529|není nainstalovaný/i;

type Attempts = ReturnType<typeof summaryAttempts>;
type States = Record<string, ListingState>;

/**
 * Postings worth summarizing: open, not finished, and either never tried, changed since, or
 * (while I have not decided on them) judged against older wishes.
 */
export function needingSummary(listings: Listing[], attempts: Attempts, state: States, profile: string): Listing[] {
  return listings.filter((l) => {
    if (!l.open || !l.text.trim()) return false;
    const st = state[l.id]?.status ?? 'new';
    if (ENDINGS.includes(st)) return false;
    const a = attempts.get(l.id);
    if (!a) return true;
    const [posting, judged = ''] = a.hash.split(':');
    if (posting !== summaryHash(l)) return true;
    return (st === 'new' || st === 'interested') && judged !== profile;
  });
}

/** The last few postings I passed on with a reason, as examples of what I do not want. */
export function recentRejections(listings: Listing[], state: States, limit = 8): Rejection[] {
  const byId = new Map(listings.map((l) => [l.id, l]));
  return Object.entries(state)
    .filter(([id, st]) => st.status === 'passed' && st.passReason && byId.has(id))
    .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
    .slice(0, limit)
    .map(([id, st]) => {
      const l = byId.get(id)!;
      return { title: l.title, company: l.company, reason: PASS_REASONS.find((r) => r.id === st.passReason)?.label ?? st.passReason };
    });
}

/** Summaries start once the wishes are written, so the first batch is not made twice. */
export const summariesOn = (s: Settings): boolean => s.aiSummaries && !!s.wishes.trim();

export function queueSummaries(): void {
  const settings = loadSettings();
  if (!summariesOn(settings)) return;
  const attempts = summaryAttempts();
  const state = loadState();
  // Cards for the deck first; among them the quick ones (already summarized, only to be judged
  // again), then by keyword fit.
  const rank = (l: Listing) => ((state[l.id]?.status ?? 'new') === 'new' ? 2 : 0) + (attempts.get(l.id)?.hash.split(':')[0] === summaryHash(l) ? 1 : 0);
  const todo = needingSummary(loadListings(), attempts, state, profileHash(settings))
    .sort((a, b) => rank(b) - rank(a) || b.fit - a.fit || b.firstSeen.localeCompare(a.firstSeen))
    .map((l) => l.id);
  // Replace the queue: what was waiting may be out of date (wishes changed, posting closed).
  queue.length = 0;
  queue.push(...todo);
  blocked = undefined; // try again: the login or the limit may be fine by now
  for (let i = active; i < WORKERS; i++) void work();
}

async function work(): Promise<void> {
  active++;
  try {
    while (queue.length && !blocked) {
      const id = queue.shift()!;
      const l = loadListings().find((x) => x.id === id);
      if (!l) continue;
      const settings = loadSettings();
      try {
        saveSummary(id, await summarize(l, settings, recentRejections(loadListings(), loadState()), getSummary(id).summary ?? undefined));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (GLOBAL.test(msg)) {
          queue.unshift(id);
          blocked = msg;
          console.warn('summaries paused:', msg);
        } else {
          saveSummaryError(id, `${summaryHash(l)}:${profileHash(settings)}`, msg);
        }
      }
    }
  } finally {
    active--;
  }
}

/** Summarize one posting now (the Přegenerovat button), outside the queue. */
export async function summarizeNow(id: string): Promise<ReturnType<typeof getSummary>> {
  const l = loadListings().find((x) => x.id === id);
  if (!l) throw new Error('Inzerát nenalezen.');
  const settings = loadSettings();
  try {
    saveSummary(id, await summarize(l, settings, recentRejections(loadListings(), loadState())));
    blocked = undefined;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    saveSummaryError(id, `${summaryHash(l)}:${profileHash(settings)}`, msg);
  }
  return getSummary(id);
}
