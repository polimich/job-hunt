/**
 * Úřad práce ČR (MPSV) open data: every registered vacancy, published daily as one JSON file.
 * https://data.mpsv.cz/od/soubory/volna-mista/ — no key, open licence.
 *
 * The file is big (~18 MB gzipped, ~190 MB of JSON), so it is downloaded at most once a day and
 * slimmed to what the app needs (~25 MB) in data/cache/mpsv-v2-<day>.json. Searches filter that by
 * town, CZ-ISCO group and keywords; re-checks of known postings look their id up in it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { today } from '../../shared/pipeline.ts';
import { cityCode, matcher } from '../../shared/search.ts';
import type { Settings } from '../../shared/types.ts';
import { DATA_DIR } from '../db.ts';
import type { Candidate, Detail } from './types.ts';

const URL = 'https://data.mpsv.cz/od/soubory/volna-mista/volna-mista.json.gz';
const CACHE_DIR = join(DATA_DIR, 'cache');

interface Raw {
  portalId: number;
  datumVlozeni?: string;
  datumZmeny?: string;
  mesicniMzdaOd?: number | null;
  mesicniMzdaDo?: number | null;
  pozadovanaProfese?: { cs?: string };
  upresnujiciInformace?: { cs?: string } | null;
  urlAdresa?: string | null;
  zamestnavatel?: { nazev?: string; ico?: string };
  profeseCzIsco?: { id?: string };
  mistoVykonuPrace?: { obec?: { id?: string } | null; pracoviste?: { adresa?: { obec?: { id?: string } } }[] | null } | null;
  pracovnePravniVztahy?: { id?: string }[] | null;
  prvniKontaktSeZamestnavatelem?: {
    komuSeHlasit?: { email?: string | null; telefon?: string | null; jmeno?: string | null; prijmeni?: string | null } | null;
  } | null;
}

/** What we keep of one vacancy. */
export interface MpsvJob {
  id: string;
  title: string;
  company: string;
  salary: string;
  posted: string;
  url: string;
  text: string;
  /** CZ-ISCO code without the prefix, e.g. "25121". */
  isco: string;
  /** RÚIAN codes of the municipalities where the work is. */
  towns: number[];
}

export const detailUrl = (portalId: number | string) => `https://up.gov.cz/volna-mista-v-cr#/volna-mista-detail/${portalId}`;

function salary(od?: number | null, doo?: number | null): string {
  if (!od && !doo) return '';
  const f = (n?: number | null) => (n ? n.toLocaleString('cs-CZ') : '');
  return `${[f(od), f(doo)].filter(Boolean).join('–')} Kč / měs`;
}

const CONTRACT: Record<string, string> = {
  'PracovnepravniVztah/plny': 'HPP plný úvazek',
  'PracovnepravniVztah/zkraceny': 'zkrácený úvazek',
  'PracovnepravniVztah/dpp': 'DPP',
  'PracovnepravniVztah/dpc': 'DPČ',
};

/** Every vacancy, mapped to what the app needs. */
export function slim(items: Raw[]): MpsvJob[] {
  return items.map((x) => {
      const who = x.prvniKontaktSeZamestnavatelem?.komuSeHlasit;
      const contact = [who?.prijmeni && who.prijmeni !== '-' ? `${who.jmeno && who.jmeno !== '-' ? `${who.jmeno} ` : ''}${who.prijmeni}` : '', who?.email, who?.telefon]
        .filter(Boolean)
        .join(', ');
      const contract = (x.pracovnePravniVztahy ?? []).map((v) => CONTRACT[v.id ?? ''] ?? '').filter(Boolean).join(', ');
      const text = [
        x.pozadovanaProfese?.cs,
        x.upresnujiciInformace?.cs,
        salary(x.mesicniMzdaOd, x.mesicniMzdaDo) && `Mzda: ${salary(x.mesicniMzdaOd, x.mesicniMzdaDo)}`,
        contract && `Úvazek: ${contract}`,
        contact && `Kontakt (Úřad práce): ${contact}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        id: String(x.portalId),
        title: x.pozadovanaProfese?.cs ?? 'Pozice',
        company: x.zamestnavatel?.nazev ?? '',
        salary: salary(x.mesicniMzdaOd, x.mesicniMzdaDo),
        posted: (x.datumZmeny ?? x.datumVlozeni ?? '').slice(0, 10),
        url: x.urlAdresa || detailUrl(x.portalId),
        text,
        isco: (x.profeseCzIsco?.id ?? '').replace('CzIsco/', ''),
        towns: [
          ...new Set(
            [x.mistoVykonuPrace?.obec?.id, ...(x.mistoVykonuPrace?.pracoviste ?? []).map((p) => p.adresa?.obec?.id)]
              .filter((id): id is string => !!id)
              .map((id) => Number(id.replace('Obec/', ''))),
          ),
        ],
      };
    });
}

/**
 * The vacancies a search profile wants: in the chosen town (anywhere when none is set) and
 * either in one of the chosen CZ-ISCO groups or mentioning a keyword in the title or text.
 */
export function pick(jobs: Iterable<MpsvJob>, s: Pick<Settings, 'location' | 'keywords' | 'mpsvCategories'>): MpsvJob[] {
  const code = s.location.trim() ? cityCode(s.location) : undefined;
  const mentions = matcher(s.keywords);
  const out: MpsvJob[] = [];
  for (const j of jobs) {
    if (code && !j.towns.includes(code)) continue;
    if (s.mpsvCategories.some((g) => j.isco.startsWith(g)) || mentions(`${j.title}\n${j.text}`)) out.push(j);
  }
  return out;
}

let memo: { day: string; jobs: Map<string, MpsvJob> } | undefined;

/** Today's filtered vacancies: from memory, from today's cache file, or downloaded. */
export async function load(onStep: (label: string) => void = () => {}): Promise<Map<string, MpsvJob>> {
  const day = today();
  if (memo?.day === day) return memo.jobs;
  // v2: every vacancy with its town and CZ-ISCO code (v1 kept only Brno developers).
  const file = join(CACHE_DIR, `mpsv-v2-${day}.json`);
  let jobs: MpsvJob[];
  if (existsSync(file)) {
    jobs = JSON.parse(readFileSync(file, 'utf8')) as MpsvJob[];
  } else {
    onStep('Úřad práce: stahuji dnešní data (~18 MB)');
    const res = await fetch(URL, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`data.mpsv.cz ${res.status}`);
    onStep('Úřad práce: zpracovávám data');
    // fetch already undoes Content-Encoding: gzip; only a raw .gz body still starts with the gzip magic bytes.
    const buf = Buffer.from(await res.arrayBuffer());
    const json = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
    const all = JSON.parse(json.toString('utf8')) as { polozky: Raw[] };
    jobs = slim(all.polozky);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(jobs));
    // Older days are no longer needed.
    for (const f of readdirSync(CACHE_DIR)) if (/^mpsv-.*\.json$/.test(f) && f !== `mpsv-v2-${day}.json`) rmSync(join(CACHE_DIR, f));
  }
  memo = { day, jobs: new Map(jobs.map((j) => [j.id, j])) };
  return memo.jobs;
}

export async function search(s: Settings, onStep: (label: string) => void): Promise<Candidate[]> {
  if (s.location.trim() && !cityCode(s.location)) throw new Error(`Úřad práce: „${s.location}“ není v seznamu měst, hledám jen na ostatních portálech`);
  const code = cityCode(s.location);
  return pick((await load(onStep)).values(), s).map((j) => ({
    source: 'mpsv' as const,
    sourceId: j.id,
    url: j.url,
    title: j.title,
    company: j.company,
    location: code ? s.location.trim() : 'Česko',
    salaryPosted: j.salary,
    text: j.text,
    local: !!code,
  }));
}

/** A vacancy is open while it is in today's file; gone from the file means filled or withdrawn. */
export async function detail(sourceId: string): Promise<Detail> {
  try {
    const job = (await load()).get(sourceId);
    return job ? { open: true, text: job.text } : { open: false, text: '' };
  } catch {
    return { open: null, text: '' };
  }
}

export const mpsvId = (url: string): string | null => /up\.gov\.cz\/.*volna-mista-detail\/(\d+)/.exec(url)?.[1] ?? null;
