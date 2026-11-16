/** StartupJobs.cz: one POST endpoint returns every offer, page by page. */
import { fetchText, fromFirstHeading, htmlToText, sleep } from '../http.ts';
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

export async function search(onStep: (label: string) => void): Promise<Candidate[]> {
  const found: Candidate[] = [];
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
      if (!places.some((p) => /brno/i.test(p)) && !prefs.includes('remote')) continue;
      const title = o.name.cs ?? o.name.en ?? '';
      found.push({
        source: 'startupjobs',
        sourceId: String(o.id),
        url: `https://www.startupjobs.cz/nabidka/${o.id}/${o.slug.cs ?? o.slug.en ?? 'x'}`,
        title,
        company: o.company.name,
        location: places.join(' / ') || 'neuvedeno',
        mode: prefs.join(', '),
        salaryPosted: salaryText(o.salary),
      });
    }
    await sleep(300);
  }
  return found;
}

export function startupjobsId(url: string): string | null {
  return /startupjobs\.cz\/(?:nabidka|job)\/(\d+)/.exec(url)?.[1] ?? null;
}

export async function detail(url: string): Promise<Detail> {
  const { status, body } = await fetchText(url);
  if (status === 404 || status === 410) return { open: false, text: '' };
  if (status !== 200) return { open: null, text: '' };
  const main = /<main[\s\S]*?<\/main>/i.exec(body)?.[0] ?? body;
  return { open: true, text: htmlToText(fromFirstHeading(main)) };
}
