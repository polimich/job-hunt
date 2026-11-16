/**
 * Jooble REST API (aggregator, CZ results). Needs a free key in JOOBLE_KEY (.env), from
 * https://jooble.org/api/about. Unverified from here: jooble.org sits behind a Cloudflare check.
 */
import { htmlToText, sleep } from '../http.ts';
import type { Candidate } from './types.ts';

interface Job {
  id?: number | string;
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  snippet?: string;
  link?: string;
  type?: string;
}

export const hasKey = () => !!process.env.JOOBLE_KEY;

export async function search(keywords: string[], location: string, onStep: (label: string) => void): Promise<Candidate[]> {
  const key = process.env.JOOBLE_KEY;
  if (!key) throw new Error('chybí JOOBLE_KEY v .env');
  const found: Candidate[] = [];
  for (const q of keywords) {
    onStep(`Jooble: ${q}`);
    const res = await fetch(`https://cz.jooble.org/api/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ keywords: q, location, page: '1' }),
      signal: AbortSignal.timeout(25_000),
    });
    if (res.status === 403 && (res.headers.get('server') ?? '').includes('cloudflare')) throw new Error('Cloudflare zablokoval požadavek');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { jobs?: Job[] };
    for (const j of data.jobs ?? []) {
      if (!j.link || !j.title) continue;
      found.push({
        source: 'jooble',
        sourceId: String(j.id ?? j.link),
        url: j.link,
        title: htmlToText(j.title),
        company: j.company ?? '',
        location: j.location ?? location,
        mode: j.type ?? '',
        salaryPosted: j.salary ?? '',
        text: htmlToText(j.snippet ?? ''),
      });
    }
    await sleep(1000);
  }
  return found;
}
