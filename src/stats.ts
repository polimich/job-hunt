/** Numbers for the overview page, computed from listings and their history. Pure, so it can be tested. */
import { addDays, furthestRank, RANK } from '../shared/pipeline';
import type { Listing, ListingState, Source } from '../shared/types';

export interface FunnelStep {
  label: string;
  n: number;
}

export interface Week {
  /** Monday, yyyy-mm-dd. */
  start: string;
  n: number;
}

export interface SourceRow {
  source: Source;
  applied: number;
  answered: number;
}

export interface Stats {
  applied: number;
  /** Applications they answered in any way, including a no. */
  answered: number;
  interviews: number;
  offers: number;
  rejected: number;
  ghosted: number;
  /** Still waiting for an answer. */
  pending: number;
  funnel: FunnelStep[];
  weeks: Week[];
  bySource: SourceRow[];
}

export function mondayOf(iso: string): string {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -((day + 6) % 7));
}

export function computeStats(listings: Listing[], state: Record<string, ListingState>, today: string, weeks = 8): Stats {
  const rows = listings.map((l) => ({ l, st: state[l.id] })).filter((x): x is { l: Listing; st: ListingState } => !!x.st);
  const reached = (r: number) => rows.filter((x) => furthestRank(x.st) >= r);
  const applied = reached(RANK.applied!);
  const isAnswered = (st: ListingState) => furthestRank(st) >= RANK.talking! || st.status === 'rejected';

  const thisMonday = mondayOf(today);
  const weekList: Week[] = Array.from({ length: weeks }, (_, i) => ({ start: addDays(thisMonday, -7 * (weeks - 1 - i)), n: 0 }));
  for (const { st } of applied) {
    if (!st.contactedAt) continue;
    const w = weekList.find((x) => x.start === mondayOf(st.contactedAt));
    if (w) w.n++;
  }

  const sources = new Map<Source, SourceRow>();
  for (const { l, st } of applied) {
    const row = sources.get(l.source) ?? { source: l.source, applied: 0, answered: 0 };
    row.applied++;
    if (isAnswered(st)) row.answered++;
    sources.set(l.source, row);
  }

  return {
    applied: applied.length,
    answered: applied.filter((x) => isAnswered(x.st)).length,
    interviews: reached(RANK.interview!).length,
    offers: reached(RANK.offer!).length,
    rejected: rows.filter((x) => x.st.status === 'rejected').length,
    ghosted: rows.filter((x) => x.st.status === 'ghosted').length,
    pending: applied.filter((x) => x.st.status === 'applied').length,
    funnel: [
      { label: 'Zajímá mě', n: reached(RANK.interested!).length },
      { label: 'Odesláno', n: applied.length },
      { label: 'V jednání', n: reached(RANK.talking!).length },
      { label: 'Pohovor', n: reached(RANK.interview!).length },
      { label: 'Nabídka', n: reached(RANK.offer!).length },
    ],
    weeks: weekList,
    bySource: [...sources.values()].sort((a, b) => b.applied - a.applied),
  };
}
