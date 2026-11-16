/** Listings added by hand: read what we can from a pasted URL, then build the listing. */
import type { Company, Listing, ManualInput, Preview, Source } from '../shared/types.ts';
import { decodeEntities, fetchText } from './http.ts';
import { toListing } from './refresh.ts';
import { detailFor, SOURCES } from './sources/index.ts';
import { slug } from './store.ts';

export function sourceOf(url: string): { source: Source; sourceId: string } {
  for (const s of SOURCES) {
    const id = s.idFromUrl?.(url);
    if (id) return { source: s.id, sourceId: id };
  }
  return { source: 'other', sourceId: slug(url.replace(/^https?:\/\//, '')) || String(Date.now()) };
}

const meta = (html: string, prop: string) =>
  decodeEntities(
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html)?.[1] ??
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i').exec(html)?.[1] ??
      '',
  ).trim();

type Guess = { title: string; company: string; location: string };

/** Job boards name themselves in og:site_name; that is never the employer. */
const BOARD = /linkedin|startupjobs|jobs\.cz|prace\.cz|indeed|glassdoor|welcome to the jungle/i;

/** Best guess at title, company and place from a page's title tags. */
export function parseTitle(pageTitle: string, siteName: string, source?: Source): Guess {
  const t = pageTitle
    .replace(/\s*\|\s*LinkedIn\s*$/i, '')
    .replace(/\s+[–—-]\s+(vacancy detail|detail (nabídky|inzerátu|pozice))\s*$/i, '')
    .trim();
  // jobs.cz: "Company | Title"
  if (source === 'jobscz') {
    const [company, ...rest] = t.split(/\s+\|\s+/);
    if (rest.length) return { company: company!.trim(), title: rest.join(' | ').trim(), location: '' };
  }
  // LinkedIn, English: "Acme hiring Frontend Developer in Brno, South Moravia, Czechia"
  const en = /^(.+?) hiring (.+?) in (.+)$/i.exec(t);
  if (en) return { company: en[1]!.trim(), title: en[2]!.trim(), location: en[3]!.trim() };
  // LinkedIn, Czech: "Frontend Developer ve společnosti Acme – Brno"
  const cs = /^(.+?) ve společnosti (.+?)(?:\s+[–—-]\s+(.+))?$/i.exec(t);
  if (cs) return { title: cs[1]!.trim(), company: cs[2]!.trim(), location: cs[3]?.trim() ?? '' };
  // Common "Title – Company" / "Title | Company" shapes.
  const parts = t.split(/\s+[|–—-]\s+/).map((p) => p.trim()).filter((p) => p && !BOARD.test(p));
  const site = BOARD.test(siteName) ? '' : siteName;
  const company = site || (parts.length > 1 ? parts[parts.length - 1]! : '');
  const title = parts.length > 1 && parts[parts.length - 1] === company ? parts.slice(0, -1).join(' – ') : (parts[0] ?? '');
  return { title, company, location: '' };
}

/** schema.org JobPosting, which many boards and careers pages embed as JSON-LD. */
export function jobPosting(html: string): Partial<Guess> {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data: unknown = JSON.parse(m[1]!);
      const items = (Array.isArray(data) ? data : [data, ...((data as { '@graph'?: unknown[] })['@graph'] ?? [])]) as Record<string, any>[];
      const job = items.find((x) => x?.['@type'] === 'JobPosting');
      if (!job) continue;
      const place = [job.jobLocation].flat()[0]?.address;
      return {
        title: decodeEntities(String(job.title ?? '')).trim(),
        company: decodeEntities(String(job.hiringOrganization?.name ?? '')).trim(),
        location: String(place?.addressLocality ?? '').trim(),
      };
    } catch {
      /* malformed block, try the next */
    }
  }
  return {};
}

export async function preview(url: string): Promise<Preview> {
  const { source, sourceId } = sourceOf(url);
  const [page, detail] = await Promise.all([fetchText(url, {}, 2), detailFor({ source, sourceId, url })]);
  const pageTitle = meta(page.body, 'og:title') || decodeEntities(/<title[^>]*>([^<]*)<\/title>/i.exec(page.body)?.[1] ?? '').trim();
  const fromTitle = parseTitle(pageTitle, meta(page.body, 'og:site_name'), source);
  const ld = jobPosting(page.body);
  return {
    source,
    sourceId,
    url,
    title: ld.title || fromTitle.title,
    company: ld.company || fromTitle.company,
    location: ld.location || fromTitle.location,
    text: detail.text,
  };
}

export function manualListing(input: ManualInput, companies: Company[], today: string): Listing {
  const url = input.url?.trim() ?? '';
  const { source, sourceId } = url ? sourceOf(url) : { source: 'other' as const, sourceId: `${slug(input.company)}-${slug(input.title)}` };
  const listing = toListing(
    { source, sourceId, url, title: input.title.trim(), company: input.company.trim(), location: input.location?.trim() ?? '', mode: input.mode, salaryPosted: input.salaryPosted },
    { open: true, text: input.text?.trim() ?? '' },
    companies,
    today,
  );
  if (input.place) listing.place = input.place;
  listing.manual = true;
  return listing;
}
