/** Search-profile helpers shared by the server (refresh) and the app (settings, place labels). */
import type { Listing } from './types.ts';

/** Lowercase, without diacritics: "Vývojář" → "vyvojar". */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const tokens = (s: string): string[] => fold(s).split(/[^a-z0-9+#]+/).filter(Boolean);

function wordSet(text: string): Set<string> {
  const t = tokens(text);
  const set = new Set(t);
  // Adjacent pairs too, so "full stack" in a text also matches the phrase "fullstack".
  for (let i = 0; i + 1 < t.length; i++) set.add(t[i]! + t[i + 1]!);
  return set;
}

/**
 * A test for "the text contains one of these phrases as whole words, in any order", ignoring
 * case, diacritics and hyphens. "full stack" matches "Fullstack" and "Full-Stack"; "java"
 * does not match "JavaScript"; "vývojář" matches "Vyvojar". Build it once, call it per text.
 */
export function matcher(phrases: string[]): (text: string) => boolean {
  const wanted = phrases.map(tokens).filter((w) => w.length);
  return (text) => {
    if (!wanted.length) return false;
    const set = wordSet(text);
    return wanted.some((words) => words.every((w) => set.has(w)) || set.has(words.join('')));
  };
}

export const hasPhrase = (text: string, phrase: string): boolean => matcher([phrase])(text);
export const hasAny = (text: string, phrases: string[]): boolean => matcher(phrases)(text);

/** Comma-separated input → clean, de-duplicated list. */
export const splitList = (s: string): string[] => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))];

/**
 * Czech towns the Úřad práce data can be filtered by (RÚIAN municipality codes, checked
 * against the dataset). Other towns still work on the portals that take a place name.
 */
export const CITIES: Record<string, number> = {
  Praha: 554782, Brno: 582786, Ostrava: 554821, Plzeň: 554791, Liberec: 563889, Olomouc: 500496,
  'České Budějovice': 544256, 'Hradec Králové': 569810, 'Ústí nad Labem': 554804, Pardubice: 555134,
  Zlín: 585068, Havířov: 555088, Kladno: 532053, Most: 567027, Opava: 505927, 'Frýdek-Místek': 598003,
  Karviná: 598917, Jihlava: 586846, Teplice: 567442, Děčín: 562335, 'Karlovy Vary': 554961,
  Chomutov: 562971, 'Jablonec nad Nisou': 563510, 'Mladá Boleslav': 535419, Prostějov: 589250,
  Přerov: 511382, 'Česká Lípa': 561380, Třebíč: 590266, Třinec: 598810, Tábor: 552046, Znojmo: 593711,
  Kolín: 533165, Příbram: 539911, Cheb: 554481, Písek: 549240, Trutnov: 579025, Kroměříž: 588296,
  Vsetín: 541630, Šumperk: 523704, 'Uherské Hradiště': 592005, Břeclav: 584291, Hodonín: 586021,
  Litoměřice: 564567, 'Havlíčkův Brod': 568414, 'Nový Jičín': 599191, Chrudim: 571164,
  Strakonice: 550787, Sokolov: 560286, Klatovy: 555771, 'Jindřichův Hradec': 545881,
  'Žďár nad Sázavou': 595209, Blansko: 581283, Vyškov: 592889, Beroun: 531057, Benešov: 529303,
  Mělník: 534676, Říčany: 538728,
};

/** The RÚIAN code for a town name typed in any case, with or without diacritics. */
export function cityCode(name: string): number | undefined {
  const key = fold(name.trim());
  for (const [n, code] of Object.entries(CITIES)) if (fold(n) === key) return code;
  return undefined;
}

/** "České Budějovice" → "ceske-budejovice", as used in jobs.cz URLs. */
export const citySlug = (name: string): string =>
  fold(name.trim())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Groups of the CZ-ISCO classification offered for the Úřad práce source. */
export const ISCO_GROUPS: { id: string; label: string }[] = [
  { id: '251', label: 'Vývoj softwaru a analýza' },
  { id: '252', label: 'Databáze a sítě' },
  { id: '351', label: 'IT technici a podpora' },
  { id: '214', label: 'Inženýři (strojní, elektro, chemie…)' },
  { id: '216', label: 'Architekti a designéři' },
  { id: '241', label: 'Finance a účetnictví (specialisté)' },
  { id: '242', label: 'Řízení, HR a administrativa (specialisté)' },
  { id: '243', label: 'Marketing, obchod a PR (specialisté)' },
  { id: '331', label: 'Účetní a finanční pracovníci' },
  { id: '332', label: 'Obchodní zástupci a nákupčí' },
  { id: '411', label: 'Administrativní pracovníci' },
  { id: '522', label: 'Prodavači' },
];

const REMOTE = ['remote', 'na dálku', 'z domova', 'kdekoli', 'home office 100', 'full remote'];

/**
 * Where a posting is relative to the search location: in the chosen town (or anywhere in
 * Czechia when no town is set), fully remote, or somewhere else.
 */
export function placeOf(location: string, mode: string, city: string): Listing['place'] {
  if (city && hasPhrase(location, city)) return 'local';
  if (hasAny(`${location} ${mode}`, REMOTE)) return 'remote';
  return city ? 'jinde' : 'local';
}

export const placeLabel = (place: Listing['place'], city: string): string =>
  place === 'local' ? city || 'ČR' : place === 'remote' ? 'Remote' : 'Jinde';
