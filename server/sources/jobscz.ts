/** jobs.cz: server-rendered search results for Brno, and posting pages. */
import { decodeEntities, fetchText, htmlToText, sleep } from '../http.ts';
import type { Candidate, Detail } from './types.ts';

export function jobsczId(url: string): string | null {
  return /jobs\.cz\/(?:rpd|jof)\/(\d+)/.exec(url)?.[1] ?? /jobs\.cz\/.*[?&]id=(\d+)/.exec(url)?.[1] ?? null;
}

export async function search(keywords: string[], onStep: (label: string) => void): Promise<Candidate[]> {
  const found: Candidate[] = [];
  for (const q of keywords) {
    onStep(`jobs.cz: ${q}`);
    for (let page = 1; page <= 2; page++) {
      const params = new URLSearchParams({ 'q[]': q, 'locality[radius]': '0', page: String(page) });
      const { body } = await fetchText(`https://www.jobs.cz/prace/brno/?${params}`);
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
          location: 'Brno',
          mode: texts.find((t) => /z domova/i.test(t)) ?? '',
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
