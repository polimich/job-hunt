/** jobs.cz: server-rendered search results (one town and radius, or the whole country), and posting pages. */
import { decodeEntities, fetchText, htmlToText, sleep } from '../http.ts';
import { citySlug } from '../../shared/search.ts';
import type { Settings } from '../../shared/types.ts';
import type { Candidate, Detail } from './types.ts';

export function jobsczId(url: string): string | null {
  return /jobs\.cz\/(?:rpd|jof)\/(\d+)/.exec(url)?.[1] ?? /jobs\.cz\/.*[?&]id=(\d+)/.exec(url)?.[1] ?? null;
}

/** jobs.cz takes these radii (km) around a town. */
const RADII = [0, 10, 20, 30, 40, 50];

export function searchUrl(q: string, s: Pick<Settings, 'location' | 'radiusKm'>, page: number): string {
  const town = citySlug(s.location);
  const params = new URLSearchParams({ 'q[]': q, page: String(page) });
  if (town) params.set('locality[radius]', String(RADII.reduce((a, r) => (r <= s.radiusKm ? r : a), 0)));
  return `https://www.jobs.cz/prace/${town ? `${town}/` : ''}?${params}`;
}

export async function search(s: Settings, onStep: (label: string) => void): Promise<Candidate[]> {
  const found: Candidate[] = [];
  const town = s.location.trim();
  for (const q of s.keywords) {
    onStep(`jobs.cz: ${q}`);
    for (let page = 1; page <= 2; page++) {
      const { status, body } = await fetchText(searchUrl(q, s, page));
      if (status === 404) throw new Error(`jobs.cz nezná místo „${town}“`);
      const articles = body.match(/<article[\s\S]*?<\/article>/g) ?? [];
      if (!articles.length) break;
      for (const a of articles) {
        const link = /href="(https:\/\/[^"]*?\/rpd\/(\d+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(a);
        if (!link) continue;
        const texts = [...a.matchAll(/<(?:span|li|div)[^>]*>([^<]{2,90})<\//g)].map((m) => decodeEntities(m[1]!).trim());
        const company = texts.find((t) => /s\.r\.o\.|a\.s\.|SE$|Group|spol\.|Skupina|[A-Z]{2,}/.test(t) && !/domova|odpověď|Přidáno|Aktualizováno|listopadu|října/.test(t)) ?? '';
        found.push({
          source: 'jobscz',
          sourceId: link[2]!,
          url: `https://www.jobs.cz/rpd/${link[2]}/`,
          title: decodeEntities(link[3]!.replace(/<[^>]+>/g, '')).trim(),
          company,
          location: town || 'Česko',
          mode: texts.find((t) => /z domova/i.test(t)) ?? '',
          local: !!town,
        });
      }
      await sleep(800);
    }
  }
  return found;
}

const START_MARKS = ['Pracovní nabídka', 'Úvodní představení'];
const END_MARKS = ['Informace o pozici'];

export async function detail(url: string): Promise<Detail> {
  const { status, body } = await fetchText(url);
  if (status === 404 || status === 410) return { open: false, text: '' };
  if (status !== 200) return { open: null, text: '' };
  if (/Nabídka již není aktuální|Tato nabídka již není/i.test(body)) return { open: false, text: '' };
  let text = htmlToText(body);
  // The page wraps the posting in a lot of portal chrome; keep the part between the known headings.
  const starts = START_MARKS.map((m) => text.lastIndexOf(`\n${m}\n`)).filter((i) => i >= 0);
  if (starts.length) text = text.slice(Math.min(...starts));
  const ends = END_MARKS.map((m) => text.indexOf(`\n${m}\n`)).filter((i) => i > 0);
  if (ends.length) text = text.slice(0, Math.min(...ends));
  return { open: true, text: text.trim() };
}
