import { describe, expect, it } from 'vitest';
import { emptyState } from '../shared/pipeline';
import type { Company, Listing } from '../shared/types';
import { applyFilters, DEFAULT_FILTERS, effectiveStatus, type Context } from '../src/filters';

const listing = (over: Partial<Listing>): Listing => ({
  id: 'a', companyId: 'co', company: 'Co', title: 'Frontend', url: 'https://x', source: 'other', sourceId: 'a', location: 'Brno',
  mode: '', place: 'brno', contract: '', stack: '', tags: ['React'], salaryPosted: '', benefits: '', fit: 3, fitSource: 'claude',
  recommended: false, strengths: '', weaknesses: '', vue: '', text: '', firstSeen: '2026-11-12', lastChecked: '2026-11-16', open: true,
  ...over,
});
const company = (over: Partial<Company>): Company => ({ id: 'co', name: 'Co', size: 'velká', emails: [], ...over });
const ctx = (over: Partial<Context> = {}): Context => ({ state: {}, companies: new Map([['co', company({})]]), latestAdded: new Set(), hits: null, ...over });

describe('effectiveStatus', () => {
  it('shows a closed posting as closed while it is still untouched', () => {
    expect(effectiveStatus(listing({ open: false }), undefined)).toBe('closed');
  });
  it('keeps your own status once you applied', () => {
    const state = { ...emptyState(), status: 'applied' as const, contactedAt: '2026-11-17' };
    expect(effectiveStatus(listing({ open: false }), state)).toBe('applied');
  });
});

describe('applyFilters', () => {
  it('hides listings I passed on by default', () => {
    const state = { a: { ...emptyState(), status: 'passed' as const } };
    expect(applyFilters([listing({})], { ...DEFAULT_FILTERS }, ctx({ state }))).toHaveLength(0);
  });
  it('requires every selected tag', () => {
    const list = [listing({ id: 'a', tags: ['React', 'TypeScript'] }), listing({ id: 'b', tags: ['React'] })];
    const out = applyFilters(list, { ...DEFAULT_FILTERS, tags: ['React', 'TypeScript'] }, ctx());
    expect(out.map((l) => l.id)).toEqual(['a']);
  });
  it('filters by the top of the estimated salary range', () => {
    const companies = new Map([
      ['low', company({ id: 'low', salary: { min: 60000, max: 90000, basis: 'odhad' } })],
      ['high', company({ id: 'high', salary: { min: 100000, max: 140000, basis: 'odhad' } })],
    ]);
    const list = [listing({ id: 'a', companyId: 'low' }), listing({ id: 'b', companyId: 'high' })];
    const out = applyFilters(list, { ...DEFAULT_FILTERS, minSalary: 100000 }, ctx({ companies }));
    expect(out.map((l) => l.id)).toEqual(['b']);
  });
  it('sorts by match, recommended first among equals', () => {
    const list = [listing({ id: 'a', fit: 3 }), listing({ id: 'b', fit: 5 }), listing({ id: 'c', fit: 5, recommended: true })];
    expect(applyFilters(list, { ...DEFAULT_FILTERS }, ctx()).map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });
  it('keeps only search hits and can sort by relevance', () => {
    const list = [listing({ id: 'a' }), listing({ id: 'b' }), listing({ id: 'c' })];
    const hits = new Map([['a', 1], ['c', 9]]);
    const out = applyFilters(list, { ...DEFAULT_FILTERS, sort: 'relevance' }, ctx({ hits }));
    expect(out.map((l) => l.id)).toEqual(['c', 'a']);
  });
});
