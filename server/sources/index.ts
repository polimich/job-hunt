/**
 * Every job source in one place. A source can search (find new postings), read one posting's
 * detail (text, still open?), and recognise its own URLs. Adding a portal = one file + one entry here.
 */
import type { Listing, Settings, Source } from '../../shared/types.ts';
import * as generic from './generic.ts';
import * as jobscz from './jobscz.ts';
import * as linkedin from './linkedin.ts';
import * as careerjet from './careerjet.ts';
import * as jooble from './jooble.ts';
import * as mpsv from './mpsv.ts';
import * as startupjobs from './startupjobs.ts';
import type { Candidate, Detail } from './types.ts';

export interface SourceDef {
  id: Source;
  /** One line for Settings: what it is and how it is read. */
  about: string;
  /** For sources behind a key: whether .env has it. */
  needsKey?: { env: string; signup: string; has: () => boolean };
  /** Off unless switched on in Settings. */
  offByDefault?: boolean;
  /** Searched on refresh when enabled in Settings. Sources without it are detail-only. */
  search?: (settings: Settings, onStep: (label: string) => void) => Promise<Candidate[]>;
  detail: (l: Pick<Listing, 'source' | 'sourceId' | 'url'>) => Promise<Detail>;
  /** The posting id when a URL belongs to this source. */
  idFromUrl?: (url: string) => string | null;
}

export const SOURCES: SourceDef[] = [
  {
    id: 'startupjobs',
    about: 'Startupy a menší firmy. JSON API; nabídky se vybírají podle klíčových slov v názvu.',
    search: (s, onStep) => startupjobs.search(s, onStep),
    detail: (l) => startupjobs.detail(l.url),
    idFromUrl: startupjobs.startupjobsId,
  },
  {
    id: 'mpsv',
    about: 'Oficiální otevřená data Úřadu práce, denně. Často se mzdou. Bere klíčová slova v textu a zvolené obory.',
    search: (s, onStep) => mpsv.search(s, onStep),
    detail: (l) => mpsv.detail(l.sourceId),
    idFromUrl: mpsv.mpsvId,
  },
  {
    id: 'jobscz',
    about: 'Největší český portál. Nemá API, čte se jeho vyhledávání.',
    search: (s, onStep) => jobscz.search(s, onStep),
    detail: (l) => jobscz.detail(l.url),
    idFromUrl: jobscz.jobsczId,
  },
  {
    id: 'careerjet',
    about: 'Agregátor českých nabídek přes oficiální API.',
    needsKey: { env: 'CAREERJET_KEY', signup: 'https://www.careerjet.cz/partners/api', has: careerjet.hasKey },
    search: (s, onStep) => careerjet.search(s.keywords, s.location.trim(), onStep),
    detail: (l) => generic.detail(l.url),
  },
  {
    id: 'jooble',
    about: 'Agregátor přes API. Neověřeno: jooble.org může požadavek zablokovat.',
    needsKey: { env: 'JOOBLE_KEY', signup: 'https://jooble.org/api/about', has: jooble.hasKey },
    search: (s, onStep) => jooble.search(s.keywords, s.location.trim(), onStep),
    detail: (l) => generic.detail(l.url),
  },
  {
    id: 'linkedin',
    about: 'Mezinárodní nabídky včetně remote. Veřejné rozhraní, nejpomalejší kvůli limitům.',
    search: (s, onStep) => linkedin.search(s, onStep),
    detail: (l) => linkedin.detail(l.sourceId),
    idFromUrl: linkedin.linkedinId,
  },
];

export const sourceDef = (id: Source): SourceDef | undefined => SOURCES.find((s) => s.id === id);

export function detailFor(l: Pick<Listing, 'source' | 'sourceId' | 'url'>): Promise<Detail> {
  return (sourceDef(l.source)?.detail ?? ((x) => generic.detail(x.url)))(l);
}

/** Sources that search on refresh, as switched on in Settings (all on unless turned off). */
export const isEnabled = (d: SourceDef, s: Settings): boolean =>
  !!d.search && (s.sources?.[d.id] ?? !d.offByDefault) && (!d.needsKey || d.needsKey.has());
export const enabledSources = (s: Settings): SourceDef[] => SOURCES.filter((d) => isEnabled(d, s));

/** For Settings: every searchable source with its switch and key state. */
export const sourceInfo = (s: Settings) =>
  SOURCES.filter((d) => d.search).map((d) => ({
    id: d.id,
    about: d.about,
    on: s.sources?.[d.id] ?? !d.offByDefault,
    needsKey: d.needsKey ? { env: d.needsKey.env, signup: d.needsKey.signup, has: d.needsKey.has() } : undefined,
  }));
