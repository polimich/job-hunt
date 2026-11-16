/**
 * StartupJobs.cz: one POST endpoint returns every offer, page by page. The API has no keyword
 * or place filter we can rely on, so offers are kept here by title keyword and town.
 */
import { fetchText, fromFirstHeading, htmlToText, sleep } from '../http.ts';
import { hasAny, hasPhrase } from '../../shared/search.ts';
import type { Settings } from '../../shared/types.ts';
import type { Candidate, Detail } from './types.ts';

interface Offer {
  id: number;
  name: Record<string, string>;
  slug: Record<string, string>;
  salary?: { min?: number; max?: number; currency?: string; period?: string } | null;
  locationPreferences?: string[];
  locations?: { place?: Record<string, string> | null; name?: Record<string, string> | null }[];
  company: { name: string };
}

function salaryText(s: Offer['salary']): string {
  if (!s || (!s.min && !s.max)) return '';
  // Amounts arrive in hundredths of the currency unit.
  const fmt = (n?: number) => (n ? Math.round(n / 100).toLocaleString('cs-CZ') : '');
  const unit = s.period === 'hour' ? '/ hod' : '/ měs';
  return `${[fmt(s.min), fmt(s.max)].filter(Boolean).join('–')} ${s.currency ?? ''} ${unit}`.trim();
}

export async function search(s: Settings, onStep: (label: string) => void): Promise<Candidate[]> {
  const found: Candidate[] = [];
  const town = s.location.trim();
  const words = [...s.keywords, ...s.titleMustMatch];
  for (let page = 1; page <= 40; page++) {
    onStep(`StartupJobs: strana ${page}`);
    const { body } = await fetchText(`https://back.startupjobs.cz/api/search-offers?page=${page}`, {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    let offers: Offer[] = [];
    try {
      offers = JSON.parse(body || '[]') as Offer[];
    } catch {
      break;
    }
    if (!offers.length) break;
    for (const o of offers) {
      const places = (o.locations ?? []).map((l) => l.place?.cs ?? l.name?.cs ?? '').filter(Boolean);
      const prefs = o.locationPreferences ?? [];
      const local = !town || places.some((p) => hasPhrase(p, town));
      if (!local && !(s.remote && prefs.includes('remote'))) continue;
      const title = o.name.cs ?? o.name.en ?? '';
      if (!hasAny(title, words)) continue;
      found.push({
        source: 'startupjobs',
        sourceId: String(o.id),
        url: `https://www.startupjobs.cz/nabidka/${o.id}/${o.slug.cs ?? o.slug.en ?? 'x'}`,
        title,
        company: o.company.name,
        location: places.join(' / ') || 'neuvedeno',
        mode: prefs.join(', '),
        salaryPosted: salaryText(o.salary),
        local: !!town && local,
      });
    }
    await sleep(300);
  }
  return found;
}

export function startupjobsId(url: string): string | null {
  return /startupjobs\.cz\/(?:nabidka|job)\/(\d+)/.exec(url)?.[1] ?? null;
}

/**
 * Posting detail from the JSON API: open while its state is "published". Falls back to the
 * web page when the API does not answer.
 */
export async function detail(url: string): Promise<Detail> {
  const id = startupjobsId(url);
  if (id) {
    const { status, body } = await fetchText(`https://back.startupjobs.cz/api/offers/${id}`, { headers: { Accept: 'application/json' } }, 2);
    if (status === 404 || status === 410) return { open: false, text: '' };
    if (status === 200) {
      try {
        const o = JSON.parse(body) as { state?: string; description?: Record<string, string> | null; name?: Record<string, string> };
        if (o.state) {
          const html = o.description?.cs ?? o.description?.en ?? '';
          const title = o.name?.cs ?? o.name?.en ?? '';
          return { open: o.state === 'published', text: htmlToText(`${title ? `<h1>${title}</h1>` : ''}${html}`) };
        }
      } catch {
        /* not JSON: use the page below */
      }
    }
  }
  return pageDetail(url);
}

async function pageDetail(url: string): Promise<Detail> {
  const { status, body } = await fetchText(url);
  if (status === 404 || status === 410) return { open: false, text: '' };
  if (status !== 200) return { open: null, text: '' };
  const main = /<main[\s\S]*?<\/main>/i.exec(body)?.[0] ?? body;
  return { open: true, text: htmlToText(fromFirstHeading(main)) };
}
