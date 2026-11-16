import type { Source } from '../../shared/types.ts';

/** A posting found by a search, before its detail page has been read. */
export interface Candidate {
  source: Source;
  sourceId: string;
  url: string;
  title: string;
  company: string;
  location: string;
  salaryPosted?: string;
  mode?: string;
  /** Found by a search limited to the chosen town (and its radius), so it counts as local. */
  local?: boolean;
  /** Full or partial posting text when the search already returns it (APIs, open data). */
  text?: string;
}

export interface Detail {
  /** true = still accepting, false = gone, null = could not tell (rate limit, network). */
  open: boolean | null;
  text: string;
}
