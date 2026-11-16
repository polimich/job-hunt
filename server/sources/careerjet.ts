/**
 * Careerjet partner API v4, Czech locale. Needs a free publisher key in CAREERJET_KEY (.env).
 * https://www.careerjet.cz/partners/api — results link through Careerjet's redirect URLs.
 */
import { createHash } from 'node:crypto';
import { htmlToText, sleep } from '../http.ts';
import type { Candidate } from './types.ts';

interface Job {
  title?: string;
  company?: string;
  locations?: string;
  salary?: string;
  url?: string;
  description?: string;
  date?: string;
}

export const hasKey = () => !!process.env.CAREERJET_KEY;
export const shortId = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 12);

export async function search(keywords: string[], location: string, onStep: (label: string) => void): Promise<Candidate[]> {
  const key = process.env.CAREERJET_KEY;
  if (!key) throw new Error('chybí CAREERJET_KEY v .env');
  const found: Candidate[] = [];
  for (const q of keywords) {
    onStep(`Careerjet: ${q}`);
    const params = new URLSearchParams({
      locale_code: 'cs_CZ',
      keywords: q,
      location,
      page_size: '50',
      sort: 'date',
      // The API wants the end user's IP and browser; for a personal app that is this machine.
      user_ip: process.env.CAREERJET_USER_IP ?? '127.0.0.1',
      user_agent: 'job-hunt-local/1.0',
    });
    const res = await fetch(`https://search.api.careerjet.net/v4/query?${params}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
    });
    if (res.status === 401 || res.status === 403) throw new Error(`neplatný klíč (${res.status})`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { jobs?: Job[] };
    for (const j of data.jobs ?? []) {
      if (!j.url || !j.title) continue;
      found.push({
        source: 'careerjet',
        sourceId: shortId(j.url),
        url: j.url,
        title: j.title,
        company: j.company ?? '',
        location: j.locations ?? location,
        salaryPosted: j.salary ?? '',
        text: htmlToText(j.description ?? ''),
      });
    }
    await sleep(1000);
  }
  return found;
}
