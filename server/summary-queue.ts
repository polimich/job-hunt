/**
 * Background queue that keeps an AI summary for every open posting that is still in play.
 * Runs after each refresh and once at start. One posting at a time, to go easy on the
 * subscription's limits. A problem that affects every call (not logged in, limit reached,
 * CLI missing) pauses the queue instead of marking each posting as failed.
 */
import { ENDINGS } from '../shared/pipeline.ts';
import type { Listing } from '../shared/types.ts';
import { getSummary, loadListings, loadSettings, loadState, saveSummary, saveSummaryError, summaryAttempts } from './store.ts';
import { summarize, summaryHash } from './summary.ts';

export interface SummaryStatus {
  running: boolean;
  pending: number;
  current?: string;
  /** Why the queue stopped, when it affects all postings. */
  blocked?: string;
}

let status: SummaryStatus = { running: false, pending: 0 };
const queue: string[] = [];

export const summaryStatus = (): SummaryStatus => ({ ...status, pending: queue.length });

const GLOBAL = /not logged in|log ?in|authenticat|oauth|token|credit|usage limit|rate limit|limit reached|quota|overloaded|401|403|429|529|není nainstalovaný/i;

/** Postings worth summarizing: open, not finished, and without an up-to-date attempt. */
export function needingSummary(listings: Listing[], attempts: ReturnType<typeof summaryAttempts>, state: ReturnType<typeof loadState>): Listing[] {
  return listings.filter((l) => {
    if (!l.open || !l.text.trim()) return false;
    const st = state[l.id]?.status;
    if (st && ENDINGS.includes(st)) return false;
    return attempts.get(l.id)?.hash !== summaryHash(l);
  });
}

export function queueSummaries(): void {
  if (!loadSettings().aiSummaries) return;
  const todo = needingSummary(loadListings(), summaryAttempts(), loadState())
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen))
    .map((l) => l.id)
    .filter((id) => !queue.includes(id));
  queue.push(...todo);
  status.blocked = undefined; // try again: the login or the limit may be fine by now
  void work();
}

async function work(): Promise<void> {
  if (status.running) return;
  status.running = true;
  try {
    while (queue.length && !status.blocked) {
      const id = queue[0]!;
      const l = loadListings().find((x) => x.id === id);
      if (!l) {
        queue.shift();
        continue;
      }
      status.current = l.title;
      try {
        saveSummary(id, await summarize(l, loadSettings()));
        queue.shift();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (GLOBAL.test(msg)) {
          status.blocked = msg;
          console.warn('summaries paused:', msg);
        } else {
          saveSummaryError(id, summaryHash(l), msg);
          queue.shift();
        }
      }
    }
  } finally {
    status.running = false;
    status.current = undefined;
  }
}

/** Summarize one posting now (the Přegenerovat button), outside the queue. */
export async function summarizeNow(id: string): Promise<ReturnType<typeof getSummary>> {
  const l = loadListings().find((x) => x.id === id);
  if (!l) throw new Error('Inzerát nenalezen.');
  try {
    saveSummary(id, await summarize(l, loadSettings()));
    status.blocked = undefined;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    saveSummaryError(id, summaryHash(l), msg);
  }
  return getSummary(id);
}
