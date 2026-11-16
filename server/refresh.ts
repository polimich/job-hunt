/**
 * Refresh: re-check every open listing, search the boards for new ones, read their text
 * and record what changed. Runs as one background job; progress is polled by the UI.
 */
import { matcher, placeOf } from '../shared/search.ts';
import { SOURCE_LABELS, type Company, type Listing, type RefreshProgress, type RefreshRun, type Settings } from '../shared/types.ts';
import { autoFit, extractTags } from './score.ts';
import { detailFor, enabledSources } from './sources/index.ts';
import type { Candidate, Detail } from './sources/types.ts';
import { addRun, loadCompanies, loadListings, loadSettings, saveCompanies, saveListings, slug } from './store.ts';

/** Reading a new posting costs a rate-limited request, so one run takes at most this many. */
const MAX_NEW_PER_RUN = 40;

let progress: RefreshProgress = { running: false, step: '', done: 0, total: 0 };

export const getProgress = (): RefreshProgress => progress;

function step(label: string, done = progress.done, total = progress.total): void {
  progress = { ...progress, step: label, done, total };
}

export { detailFor };

const titleKey = (company: string, title: string) => `${slug(company)}|${slug(title)}`;

export function toListing(c: Candidate, d: Detail, companies: Company[], today: string, settings: Settings): Listing {
  let company = companies.find((x) => x.id === slug(c.company));
  if (!company) {
    company = { id: slug(c.company) || `firma-${c.sourceId}`, name: c.company || 'Neznámá firma', size: 'neznámá', emails: [] };
    companies.push(company);
  }
  const mode = c.mode ?? '';
  const place = c.local ? 'local' : placeOf(c.location, mode, settings.location.trim());
  const all = `${c.title}\n${d.text}`;
  return {
    id: `${c.source}-${c.sourceId}`,
    companyId: company.id,
    company: company.name,
    title: c.title,
    url: c.url,
    source: c.source,
    sourceId: c.sourceId,
    location: c.location,
    mode: mode || 'neuvedeno',
    place,
    contract: 'neuvedeno',
    stack: extractTags(all).join(', '),
    tags: extractTags(all),
    salaryPosted: c.salaryPosted ?? '',
    benefits: '',
    fit: autoFit(c.title, d.text, place, settings),
    fitSource: 'auto',
    recommended: false,
    strengths: '',
    weaknesses: '',
    vue: '',
    text: d.text,
    firstSeen: today,
    lastChecked: today,
    open: true,
  };
}

async function run(searchNew: boolean): Promise<RefreshRun> {
  const today = new Date().toISOString().slice(0, 10);
  const settings = loadSettings();
  const listings = loadListings();
  const companies = loadCompanies();
  const result: RefreshRun = { at: new Date().toISOString(), added: [], closed: [], reopened: [], changed: [], errors: [] };

  // 1. Re-check what we already have.
  const toCheck = listings.filter((l) => l.open && !l.manual);
  let i = 0;
  for (const l of toCheck) {
    step(`Kontroluji: ${l.company}`, i++, toCheck.length);
    const d = await detailFor(l);
    if (d.open === null) {
      result.errors.push(`${l.company} – ${l.title}: nepodařilo se ověřit`);
      continue;
    }
    l.lastChecked = today;
    if (!d.open) {
      l.open = false;
      l.closedAt = today;
      result.closed.push(l.id);
    } else if (d.text && d.text !== l.text) {
      if (l.text) result.changed.push(l.id);
      l.text = d.text;
      if (l.fitSource === 'auto') {
        l.tags = extractTags(`${l.title}\n${d.text}`);
        l.stack = l.tags.join(', ');
      }
    }
  }
  saveListings(listings);
  if (!searchNew) {
    addRun(result);
    return result;
  }

  // 2. Search the boards.
  if (!settings.keywords.length) {
    result.errors.push('Nejsou nastavená klíčová slova, nové inzeráty se nehledaly. Doplň je v Nastavení → Hledání.');
    addRun(result);
    return result;
  }
  step('Hledám nové inzeráty', 0, 0);
  const candidates: Candidate[] = [];
  for (const src of enabledSources(settings)) {
    try {
      candidates.push(...(await src.search!(settings, (s) => step(s))));
    } catch (e) {
      result.errors.push(`${SOURCE_LABELS[src.id]}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. Keep relevant titles we have not seen, one per company + title.
  const relevant = settings.titleMustMatch.length ? matcher(settings.titleMustMatch) : () => true;
  const excluded = matcher(settings.excludeWords);
  const knownIds = new Set(listings.map((l) => `${l.source}-${l.sourceId}`));
  const knownTitles = new Set(listings.map((l) => titleKey(l.company, l.title)));
  const fresh: Candidate[] = [];
  for (const c of candidates) {
    const id = `${c.source}-${c.sourceId}`;
    const key = titleKey(c.company, c.title);
    if (knownIds.has(id) || knownTitles.has(key)) continue;
    if (!relevant(c.title) || excluded(c.title)) continue;
    knownIds.add(id);
    knownTitles.add(key);
    fresh.push(c);
  }
  // Postings that came with their text cost nothing more; the cap is for ones that need a page read.
  const withText = fresh.filter((c) => c.text);
  const toRead = fresh.filter((c) => !c.text);
  if (toRead.length > MAX_NEW_PER_RUN) {
    result.errors.push(`Nalezeno ${toRead.length} nových inzerátů ke čtení, načteno prvních ${MAX_NEW_PER_RUN}. Zbytek přibude při dalším obnovení.`);
  }

  // 4. Read the new ones.
  const batch = [...withText, ...toRead.slice(0, MAX_NEW_PER_RUN)];
  i = 0;
  for (const c of batch) {
    step(`Čtu nový inzerát: ${c.company}`, i++, batch.length);
    // APIs and open data already return the text; only scraped sources need a detail request.
    const d = c.text ? { open: true, text: c.text } : await detailFor(c);
    if (d.open === false) continue;
    const listing = toListing(c, d, companies, today, settings);
    listings.push(listing);
    result.added.push(listing.id);
  }

  saveCompanies(companies);
  saveListings(listings);
  addRun(result);
  return result;
}

/** Start a refresh unless one is already running. Returns false when it was already running. */
export function startRefresh(searchNew = true): boolean {
  if (progress.running) return false;
  progress = { running: true, step: 'Začínám', done: 0, total: 0, startedAt: new Date().toISOString() };
  run(searchNew)
    .then(() => {
      progress = { running: false, step: 'Hotovo', done: 0, total: 0 };
    })
    .catch((e: unknown) => {
      progress = { running: false, step: 'Chyba', done: 0, total: 0, error: e instanceof Error ? e.message : String(e) };
    });
  return true;
}

export async function refreshAndWait(onProgress: (p: RefreshProgress) => void, searchNew = true): Promise<void> {
  startRefresh(searchNew);
  let last = '';
  while (progress.running) {
    const line = `${progress.step} ${progress.total ? `${progress.done}/${progress.total}` : ''}`;
    if (line !== last) onProgress(progress);
    last = line;
    await new Promise((r) => setTimeout(r, 500));
  }
  onProgress(progress);
}
