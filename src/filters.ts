/** Pure filtering and sorting of listings, kept apart from the UI so it can be tested. */
import type { Company, Listing, ListingState, Status } from '../shared/types';

export interface Filters {
  query: string;
  statuses: Status[];
  places: Listing['place'][];
  minFit: number;
  tags: string[];
  onlyRecommended: boolean;
  onlyVue: boolean;
  onlyEmail: boolean;
  onlyNew: boolean;
  /** Estimated top of the salary range must reach this many CZK; 0 = off. */
  minSalary: number;
  size: '' | 'velká' | 'střední' | 'malá';
  sort: 'fit' | 'salary' | 'newest' | 'company' | 'relevance';
}

export const DEFAULT_FILTERS: Filters = {
  query: '',
  statuses: ['new', 'interested', 'applied', 'talking', 'interview', 'offer'],
  places: [],
  minFit: 1,
  tags: [],
  onlyRecommended: false,
  onlyVue: false,
  onlyEmail: false,
  onlyNew: false,
  minSalary: 0,
  size: '',
  sort: 'fit',
};

/** A closed posting shows as "closed" unless you already moved it past "new" yourself. */
export function effectiveStatus(listing: Listing, state: ListingState | undefined): Status {
  const own = state?.status ?? 'new';
  if (!listing.open && (own === 'new' || own === 'interested')) return 'closed';
  return own;
}

export interface Context {
  state: Record<string, ListingState>;
  companies: Map<string, Company>;
  /** Listing ids added by the latest refresh. */
  latestAdded: Set<string>;
  /** Search hits: id → score. null when there is no query. */
  hits: Map<string, number> | null;
}

export function applyFilters(listings: Listing[], f: Filters, ctx: Context): Listing[] {
  const out = listings.filter((l) => {
    const company = ctx.companies.get(l.companyId);
    if (ctx.hits && !ctx.hits.has(l.id)) return false;
    if (f.statuses.length && !f.statuses.includes(effectiveStatus(l, ctx.state[l.id]))) return false;
    if (f.places.length && !f.places.includes(l.place)) return false;
    if (l.fit < f.minFit) return false;
    if (f.tags.length && !f.tags.every((t) => l.tags.includes(t))) return false;
    if (f.onlyRecommended && !l.recommended) return false;
    if (f.onlyVue && !l.vue) return false;
    if (f.onlyEmail && !company?.emails.length) return false;
    if (f.onlyNew && !ctx.latestAdded.has(l.id)) return false;
    if (f.minSalary && (company?.salary?.max ?? 0) < f.minSalary) return false;
    if (f.size && company?.size !== f.size) return false;
    return true;
  });
  const salaryTop = (l: Listing) => ctx.companies.get(l.companyId)?.salary?.max ?? 0;
  const byFit = (a: Listing, b: Listing) => b.fit - a.fit || Number(b.recommended) - Number(a.recommended) || a.company.localeCompare(b.company, 'cs');
  const sort = f.sort === 'relevance' && !ctx.hits ? 'fit' : f.sort;
  return out.sort((a, b) => {
    if (sort === 'relevance') return (ctx.hits!.get(b.id) ?? 0) - (ctx.hits!.get(a.id) ?? 0);
    if (sort === 'salary') return salaryTop(b) - salaryTop(a) || byFit(a, b);
    if (sort === 'newest') return b.firstSeen.localeCompare(a.firstSeen) || byFit(a, b);
    if (sort === 'company') return a.company.localeCompare(b.company, 'cs') || byFit(a, b);
    return byFit(a, b);
  });
}
