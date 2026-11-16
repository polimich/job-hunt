/** LinkedIn through its public guest endpoints. They rate-limit hard, so every call is spaced out. */
import { decodeEntities, fetchText, htmlToText, sleep } from '../http.ts';
import type { Settings } from '../../shared/types.ts';
import type { Candidate, Detail } from './types.ts';

const BASE = 'https://www.linkedin.com/jobs-guest/jobs/api';
const PAUSE_MS = 2_500;

export function linkedinId(url: string): string | null {
  const m = /linkedin\.com\/jobs\/view\/(?:.*?-)?(\d{8,})(?:[/?#]|$)/.exec(url);
  return m?.[1] ?? null;
}

function field(card: string, cls: string): string {
  const m = new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</(?:h3|h4|span|a)>`).exec(card);
  return m ? decodeEntities(m[1]!.replace(/<[^>]+>/g, '')).trim() : '';
}

interface Query {
  keywords: string;
  location: string;
  /** Posted within this many seconds; omit for any time. */
  within?: number;
  /** Search radius in miles around the location. */
  distance?: number;
  remoteOnly?: boolean;
}

async function searchOne(q: Query, pages: number): Promise<Candidate[]> {
  const found: Candidate[] = [];
  for (let page = 0; page < pages; page++) {
    const params = new URLSearchParams({ keywords: q.keywords, location: q.location, start: String(page * 25) });
    if (q.within) params.set('f_TPR', `r${q.within}`);
    if (q.distance) params.set('distance', String(q.distance));
    if (q.remoteOnly) params.set('f_WT', '2');
    const { body } = await fetchText(`${BASE}/seeMoreJobPostings/search?${params}`);
    const cards = body.match(/<li>[\s\S]*?<\/li>/g) ?? [];
    for (const card of cards) {
      const id = /jobPosting:(\d+)/.exec(card)?.[1];
      if (!id) continue;
      found.push({
        source: 'linkedin',
        sourceId: id,
        url: `https://www.linkedin.com/jobs/view/${id}`,
        title: field(card, 'base-search-card__title'),
        company: field(card, 'base-search-card__subtitle'),
        location: field(card, 'job-search-card__location'),
        mode: q.remoteOnly ? 'remote' : '',
      });
    }
    await sleep(PAUSE_MS);
    if (cards.length < 10) break;
  }
  return found;
}

const DAY = 24 * 3600;

/** One query per keyword in the chosen town (or all of Czechia), plus one for remote jobs when wanted. */
export function queriesFor(s: Pick<Settings, 'keywords' | 'location' | 'radiusKm' | 'remote' | 'postedWithinDays'>): Query[] {
  const within = s.postedWithinDays > 0 ? s.postedWithinDays * DAY : undefined;
  const town = s.location.trim();
  const queries: Query[] = [];
  for (const k of s.keywords) {
    queries.push({
      keywords: k,
      location: town ? `${town}, Czechia` : 'Czechia',
      within,
      distance: town && s.radiusKm > 0 ? Math.round(s.radiusKm / 1.609) : undefined,
    });
    // Without a town the query above already covers the whole country, remote jobs included.
    if (s.remote && town) queries.push({ keywords: k, location: 'Czechia', within, remoteOnly: true });
  }
  return queries;
}

export async function search(s: Settings, onStep: (label: string) => void): Promise<Candidate[]> {
  const all: Candidate[] = [];
  for (const q of queriesFor(s)) {
    onStep(`LinkedIn: ${q.keywords} · ${q.remoteOnly ? 'remote ČR' : q.location.replace(', Czechia', '')}`);
    all.push(...(await searchOne(q, 2)));
  }
  return all;
}

export async function detail(sourceId: string): Promise<Detail> {
  const { status, body } = await fetchText(`${BASE}/jobPosting/${sourceId}`);
  await sleep(PAUSE_MS);
  if (status === 404 || status === 410) return { open: false, text: '' };
  if (status !== 200 || !body.includes('top-card-layout__title')) return { open: null, text: '' };
  const markup = /show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/.exec(body)?.[1] ?? '';
  return { open: !body.includes('No longer accepting applications'), text: htmlToText(markup) };
}
