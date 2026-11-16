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
}

export interface Detail {
  /** true = still accepting, false = gone, null = could not tell (rate limit, network). */
  open: boolean | null;
  text: string;
}
