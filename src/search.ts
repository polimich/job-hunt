/** Full-text index over the listings, with prefix and typo-tolerant matching. */
import MiniSearch from 'minisearch';
import type { Listing } from '../shared/types';

const strip = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function buildIndex(listings: Listing[]): MiniSearch<Listing> {
  const index = new MiniSearch<Listing>({
    fields: ['title', 'company', 'stack', 'location', 'strengths', 'weaknesses', 'text'],
    storeFields: [],
    // Match "vyvojar" to "vývojář": index and query both lose their diacritics.
    processTerm: (term) => strip(term),
    searchOptions: {
      boost: { title: 4, company: 4, stack: 3, location: 2 },
      prefix: true,
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
      combineWith: 'AND',
    },
  });
  index.addAll(listings);
  return index;
}

export function search(index: MiniSearch<Listing>, query: string): Map<string, number> | null {
  const q = query.trim();
  if (!q) return null;
  return new Map(index.search(q).map((r) => [r.id as string, r.score]));
}

/** Split text into pieces so the UI can mark the query terms. Matches ignore case and diacritics. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = query.trim().split(/\s+/).map(strip).filter((t) => t.length > 1);
  if (!terms.length) return [{ text, hit: false }];
  const plain = strip(text);
  // strip() keeps one character per character for Czech text, so offsets line up.
  if (plain.length !== text.length) return [{ text, hit: false }];
  const marks: [number, number][] = [];
  for (const t of terms) {
    for (let i = plain.indexOf(t); i >= 0; i = plain.indexOf(t, i + t.length)) marks.push([i, i + t.length]);
  }
  if (!marks.length) return [{ text, hit: false }];
  marks.sort((a, b) => a[0] - b[0]);
  const parts: { text: string; hit: boolean }[] = [];
  let pos = 0;
  for (const [from, to] of marks) {
    if (from < pos) continue;
    if (from > pos) parts.push({ text: text.slice(pos, from), hit: false });
    parts.push({ text: text.slice(from, to), hit: true });
    pos = to;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false });
  return parts;
}
