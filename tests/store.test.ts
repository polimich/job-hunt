import { beforeEach, describe, expect, it } from 'vitest';
import { cleanLabels, emptyState, withEvent, withStatus } from '../shared/pipeline';
import type { Listing } from '../shared/types';
import { openDb } from '../server/db';
import { csvCell, toCsv } from '../server/export';
import * as store from '../server/store';

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'a', companyId: 'co', company: 'Co', title: 'Frontend', url: 'https://x', source: 'other', sourceId: 'a', location: 'Brno',
  mode: '', place: 'brno', contract: '', stack: '', tags: ['React'], salaryPosted: '', benefits: '', fit: 3, fitSource: 'auto',
  recommended: false, strengths: '', weaknesses: '', vue: '', text: 'hello', firstSeen: '2026-11-12', lastChecked: '2026-11-16', open: true,
  ...over,
});
const S = { followUpDays: 7 };

beforeEach(() => store.useDb(openDb(':memory:')));

describe('SQLite store', () => {
  it('round-trips listings and companies', () => {
    store.saveCompanies([{ id: 'co', name: 'Co', size: 'malá', emails: [{ address: 'a@b.cz', kind: 'recruiting' }], salary: { min: 1, max: 2, basis: 'odhad' } }]);
    store.saveListings([listing(), listing({ id: 'b', manual: true, open: false, closedAt: '2026-11-15', recommended: true })]);
    expect(store.loadListings()).toEqual([listing(), listing({ id: 'b', manual: true, open: false, closedAt: '2026-11-15', recommended: true })]);
    expect(store.loadCompanies()[0]!.emails[0]!.address).toBe('a@b.cz');
  });

  it('keeps state and history in order, and replaces history on write', () => {
    let st = withStatus(emptyState(), 'applied', '2026-11-16', S);
    st = withEvent(st, { kind: 'interview', at: '2026-11-20', time: '10:00', text: 'CTO' }, '2026-11-16', S);
    store.putState('a', st);
    expect(store.getState('a')).toEqual(st);
    store.putState('a', { ...st, events: st.events.slice(0, 1) });
    expect(store.getState('a')!.events).toHaveLength(1);
    expect(Object.keys(store.loadState())).toEqual(['a']);
  });

  it('deletes a listing with its state and history', () => {
    store.saveListings([listing()]);
    store.putState('a', withStatus(emptyState(), 'applied', '2026-11-16', S));
    store.deleteListing('a');
    expect(store.loadListings()).toEqual([]);
    expect(store.getState('a')).toBeUndefined();
  });

  it('returns runs newest first and merges settings over defaults', () => {
    store.addRun({ at: '1', added: ['x'], closed: [], reopened: [], changed: [], errors: [] });
    store.addRun({ at: '2', added: [], closed: [], reopened: [], changed: [], errors: [] });
    expect(store.loadRuns().map((r) => r.at)).toEqual(['2', '1']);
    store.saveSettings({ ...store.loadSettings(), minSalary: 123 });
    expect(store.loadSettings()).toMatchObject({ minSalary: 123, followUpDays: 7 });
  });

  it('imports the old JSON files, mapping legacy statuses', () => {
    const target = openDb(':memory:');
    store.importLegacy(target, {
      'listings.json': [listing()],
      'companies.json': [{ id: 'co', name: 'Co', size: 'malá', emails: [] }],
      'state.json': { a: { status: 'contacted', note: 'n', contactedAt: '2026-11-10', updatedAt: '' } },
      'runs.json': [{ at: 'new', added: [], closed: [], reopened: [], changed: [], errors: [] }, { at: 'old', added: [], closed: [], reopened: [], changed: [], errors: [] }],
      'settings.json': { minSalary: 90000 },
    });
    store.useDb(target);
    expect(store.getState('a')).toMatchObject({ status: 'applied', note: 'n', events: [] });
    expect(store.loadRuns().map((r) => r.at)).toEqual(['new', 'old']);
    expect(store.loadSettings().minSalary).toBe(90000);
  });
});

describe('people, rating, labels', () => {
  it('stores contacts and unlinks history when one is deleted', () => {
    store.saveContact({ id: 'p1', companyId: 'co', name: 'Jana', role: 'HR', email: '', phone: '', linkedin: '', note: '', createdAt: 'x' });
    let st = withStatus(emptyState(), 'applied', '2026-11-16', S);
    st = withEvent(st, { kind: 'message', at: '2026-11-17', contactId: 'p1', text: 'odpověděla' }, '2026-11-17', S);
    store.putState('a', { ...st, rating: 4, labels: ['remote'], referredBy: 'Petr' });
    expect(store.getState('a')).toMatchObject({ rating: 4, labels: ['remote'], referredBy: 'Petr' });
    expect(store.getState('a')!.events.at(-1)!.contactId).toBe('p1');
    store.deleteContact('p1');
    expect(store.loadContacts()).toEqual([]);
    expect(store.getState('a')!.events.at(-1)!.contactId).toBeUndefined();
  });
  it('cleans labels', () => {
    expect(cleanLabels([' Remote ', 'remote', '', 'Startup', 42])).toEqual(['remote', 'startup', '42']);
    expect(cleanLabels('x')).toEqual([]);
  });
});

describe('tasks', () => {
  it('stores, updates and removes tasks with their listing', () => {
    store.saveListings([listing()]);
    store.saveTask({ id: 't1', listingId: 'a', title: 'Úkol na doma', due: '2026-11-20', doneAt: '', createdAt: 'x' });
    store.saveTask({ ...store.getTask('t1')!, doneAt: '2026-11-18T10:00:00Z' });
    expect(store.loadTasks()[0]).toMatchObject({ title: 'Úkol na doma', doneAt: '2026-11-18T10:00:00Z' });
    store.deleteListing('a');
    expect(store.loadTasks()).toEqual([]);
  });
  it('fills in template defaults for older settings', () => {
    store.saveSettings({ ...store.loadSettings(), templates: { followUp: { cs: { subject: 'X', body: '' }, en: { subject: '', body: '' } } } as never });
    const t = store.loadSettings().templates;
    expect(t.followUp.cs.subject).toBe('X');
    expect(t.thankYou.cs.body).toContain('{title}');
  });
});

describe('documents', () => {
  it('drops a deleted document from applications', () => {
    store.saveDoc({ id: 'd1', label: 'CV EN', kind: 'cv', fileName: 'cv.pdf', size: 10, createdAt: 'x' });
    store.putState('a', { ...emptyState(), docIds: ['d1', 'd2'] });
    expect(store.getState('a')!.docIds).toEqual(['d1', 'd2']);
    store.deleteDoc('d1');
    expect(store.loadDocs()).toEqual([]);
    expect(store.getState('a')!.docIds).toEqual(['d2']);
  });
});

describe('CSV export', () => {
  it('quotes and defuses formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });
  it('writes one row per listing with its status', () => {
    const csv = toCsv({ listings: [listing()], companies: [], contacts: [], tasks: [], docs: [], state: { a: { ...emptyState(), status: 'applied' } }, runs: [], settings: store.loadSettings() });
    expect(csv.split('\r\n')[1]).toContain('Co,Frontend,applied');
  });
});
