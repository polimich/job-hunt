/**
 * Background queue for application kits: every posting on the shortlist gets one, best rated
 * first. A posting is prepared once; making it again (or a tailored CV) happens on request and
 * goes to the front of the same queue, so the page never waits on a long request.
 */
import type { ApplicationKit, CompanyResearch, Listing, ListingState, Settings } from '../shared/types.ts';
import { research, writeCv, writeKit } from './kit.ts';
import { getKit, getResearch, getSummary, kitAttempts, loadListings, loadSettings, loadState, saveKit, saveKitError, saveResearch } from './store.ts';

export interface KitStatus {
  running: boolean;
  /** Listings waiting or being worked on. */
  ids: string[];
  /** Why the queue stopped, when it affects all postings. */
  blocked?: string;
}

interface Job {
  id: string;
  kind: 'kit' | 'cv';
  /** Search the web again even when the company was researched recently. */
  fresh?: boolean;
}

const WORKERS = 2;
const RESEARCH_DAYS = 30;
const GLOBAL = /not logged in|log ?in|authenticat|oauth|token|credit|usage limit|rate limit|limit reached|quota|overloaded|401|403|429|529|není nainstalovaný/i;

let active = 0;
let blocked: string | undefined;
const queue: Job[] = [];
const working = new Set<string>();

export const kitStatus = (): KitStatus => ({ running: active > 0, ids: [...new Set([...working, ...queue.map((j) => j.id)])], blocked });

/** Kits are made once my profile is written: it is the only source of facts about me. */
export const kitsOn = (s: Settings): boolean => s.aiKits && !!s.profile.trim();

/** Shortlisted, still open postings that were never prepared. */
export function needingKit(listings: Listing[], state: Record<string, ListingState>, attempted: Set<string>): Listing[] {
  return listings
    .filter((l) => l.open && !!l.text.trim() && state[l.id]?.status === 'interested' && !attempted.has(l.id))
    .sort((a, b) => (state[b.id]?.rating ?? 0) - (state[a.id]?.rating ?? 0) || b.fit - a.fit);
}

function start(): void {
  blocked = undefined; // try again: the login or the limit may be fine by now
  for (let i = active; i < WORKERS; i++) void work();
}

export function queueKits(): void {
  if (!kitsOn(loadSettings())) return;
  const waiting = new Set(queue.map((j) => j.id));
  for (const l of needingKit(loadListings(), loadState(), kitAttempts())) if (!waiting.has(l.id) && !working.has(l.id)) queue.push({ id: l.id, kind: 'kit' });
  if (queue.length) start();
}

/** Ask for a kit (again) or a tailored CV now; it jumps the queue. */
export function requestKit(job: Job): KitStatus {
  if (!queue.some((j) => j.id === job.id && j.kind === job.kind)) queue.unshift(job);
  start();
  return kitStatus();
}

const fresh = (r: CompanyResearch | null): r is CompanyResearch => !!r && Date.now() - Date.parse(r.createdAt) < RESEARCH_DAYS * 86_400_000;

/** Research is a bonus: when the search fails, the drafts are written from the posting alone. */
async function researchFor(l: Listing, again: boolean): Promise<CompanyResearch | null> {
  const have = getResearch(l.companyId);
  if (!again && fresh(have)) return have;
  try {
    const found = await research(l, getSummary(l.id).summary);
    saveResearch(l.companyId, found);
    return found;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (GLOBAL.test(msg)) throw e;
    console.warn(`research failed for ${l.company}:`, msg);
    return have;
  }
}

async function run(job: Job): Promise<void> {
  const l = loadListings().find((x) => x.id === job.id);
  if (!l) return;
  const settings = loadSettings();
  if (!settings.profile.trim()) throw new Error('Nejdřív vyplň „Můj profil“ v Nastavení.');
  const summary = getSummary(l.id).summary;
  const prev = getKit(l.id);
  if (job.kind === 'cv') {
    if (!prev) throw new Error('Nejdřív připrav přihlášku.');
    const cvDoc = await writeCv(l, summary, settings, prev);
    // What I edited while the CV was being written stays.
    saveKit(l.id, { ...(getKit(l.id) ?? prev), cvDoc });
    return;
  }
  const kit: ApplicationKit = await writeKit(l, summary, settings, await researchFor(l, !!job.fresh));
  saveKit(l.id, { ...kit, done: prev?.done ?? [], cvDoc: prev?.cvDoc });
}

async function work(): Promise<void> {
  active++;
  try {
    while (queue.length && !blocked) {
      const job = queue.shift()!;
      // The same posting is never worked on twice at once.
      if (working.has(job.id)) {
        await new Promise((r) => setTimeout(r, 1000));
        queue.push(job);
        continue;
      }
      working.add(job.id);
      try {
        await run(job);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (GLOBAL.test(msg)) {
          queue.unshift(job);
          blocked = msg;
          console.warn('kits paused:', msg);
        } else saveKitError(job.id, msg);
      } finally {
        working.delete(job.id);
      }
    }
  } finally {
    active--;
  }
}
