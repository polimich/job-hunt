/**
 * Úřad práce ČR (MPSV) open data: every registered vacancy, published daily as one JSON file.
 * https://data.mpsv.cz/od/soubory/volna-mista/ — no key, open licence.
 *
 * The file is big (~18 MB gzipped, ~190 MB of JSON), so it is downloaded at most once a day and only
 * the software-developer vacancies (CZ-ISCO 251x) in the chosen municipality are kept, in
 * data/cache/mpsv-<day>.json. Re-checks of known postings use that same filtered set.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { today } from '../../shared/pipeline.ts';
import { DATA_DIR } from '../db.ts';
import type { Candidate, Detail } from './types.ts';

const URL = 'https://data.mpsv.cz/od/soubory/volna-mista/volna-mista.json.gz';
const CACHE_DIR = join(DATA_DIR, 'cache');
/** Brno in the RÚIAN register of municipalities. */
export const BRNO = 'Obec/582786';
/** Software and applications developers and analysts. */
const IT_ISCO = 'CzIsco/251';

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

/** Keep developer vacancies in one municipality, mapped to what the app needs. */
export function pick(items: Raw[], obec = BRNO): MpsvJob[] {
  return items
    .filter((x) => x.profeseCzIsco?.id?.startsWith(IT_ISCO))
    .filter((x) => {
      const m = x.mistoVykonuPrace;
      return m?.obec?.id === obec || (m?.pracoviste ?? []).some((p) => p.adresa?.obec?.id === obec);
    })
    .map((x) => {
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
        title: x.pozadovanaProfese?.cs ?? 'Vývojář',
        company: x.zamestnavatel?.nazev ?? '',
        salary: salary(x.mesicniMzdaOd, x.mesicniMzdaDo),
        posted: (x.datumZmeny ?? x.datumVlozeni ?? '').slice(0, 10),
        url: x.urlAdresa || detailUrl(x.portalId),
        text,
      };
    });
}

let memo: { day: string; jobs: Map<string, MpsvJob> } | undefined;

/** Today's filtered vacancies: from memory, from today's cache file, or downloaded. */
export async function load(onStep: (label: string) => void = () => {}): Promise<Map<string, MpsvJob>> {
  const day = today();
  if (memo?.day === day) return memo.jobs;
  const file = join(CACHE_DIR, `mpsv-${day}.json`);
  let jobs: MpsvJob[];
  if (existsSync(file)) {
    jobs = JSON.parse(readFileSync(file, 'utf8')) as MpsvJob[];
  } else {
    onStep('Úřad práce: stahuji dnešní data (~18 MB)');
    const res = await fetch(URL, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`data.mpsv.cz ${res.status}`);
    onStep('Úřad práce: vybírám IT pozice v Brně');
    // fetch already undoes Content-Encoding: gzip; only a raw .gz body still starts with the gzip magic bytes.
    const buf = Buffer.from(await res.arrayBuffer());
    const json = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
    const all = JSON.parse(json.toString('utf8')) as { polozky: Raw[] };
    jobs = pick(all.polozky);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(jobs));
    // Older days are no longer needed.
    for (const f of readdirSync(CACHE_DIR)) if (/^mpsv-.*\.json$/.test(f) && f !== `mpsv-${day}.json`) rmSync(join(CACHE_DIR, f));
  }
  memo = { day, jobs: new Map(jobs.map((j) => [j.id, j])) };
  return memo.jobs;
}

export async function search(onStep: (label: string) => void): Promise<Candidate[]> {
  const jobs = await load(onStep);
  return [...jobs.values()].map((j) => ({
    source: 'mpsv' as const,
    sourceId: j.id,
    url: j.url,
    title: j.title,
    company: j.company,
    location: 'Brno',
    salaryPosted: j.salary,
    text: j.text,
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
