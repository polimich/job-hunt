import { describe, expect, it } from 'vitest';
import type { Listing } from '../shared/types';
import { buildIndex, highlight, search } from '../src/search';

const base: Listing = {
  id: 'a', companyId: 'co', company: 'Kontent.ai', title: 'Fullstack vývojář', url: 'https://x', source: 'other', sourceId: 'a',
  location: 'Brno', mode: '', place: 'brno', contract: '', stack: 'React, TypeScript', tags: [], salaryPosted: '', benefits: '', fit: 3,
  fitSource: 'claude', recommended: false, strengths: '', weaknesses: '', vue: '', text: 'Hledáme kolegu se zkušeností s Reactem.',
  firstSeen: '', lastChecked: '', open: true,
};
const index = buildIndex([base, { ...base, id: 'b', company: 'Veeam', title: 'JavaScript developer', stack: 'Playwright', text: 'Backup software.' }]);

describe('search', () => {
  it('returns null for an empty query', () => {
    expect(search(index, '  ')).toBeNull();
  });
  it('ignores diacritics', () => {
    expect([...search(index, 'vyvojar')!.keys()]).toEqual(['a']);
  });
  it('tolerates a typo in a longer word', () => {
    expect([...search(index, 'typescritp')!.keys()]).toEqual(['a']);
  });
  it('matches a prefix inside the posting text', () => {
    expect([...search(index, 'backu')!.keys()]).toEqual(['b']);
  });
});

describe('highlight', () => {
  it('marks matches regardless of case and diacritics', () => {
    const parts = highlight('Fullstack Vývojář v Brně', 'vyvojar');
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['Vývojář']);
  });
  it('returns the text untouched without a query', () => {
    expect(highlight('abc', '')).toEqual([{ text: 'abc', hit: false }]);
  });
});
