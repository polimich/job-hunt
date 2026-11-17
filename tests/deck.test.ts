import { describe, expect, it } from 'vitest';
import { deckOf, matchOf, shortlistOf } from '../shared/deck';
import { emptyState, withStatus } from '../shared/pipeline';
import type { Listing, ListingState, ListingSummary } from '../shared/types';

const listing = (id: string, over: Partial<Listing> = {}): Listing =>
  ({ id, company: 'Co', title: id, open: true, fit: 3, firstSeen: '2026-11-12', text: 'x', tags: [], ...over }) as Listing;
const card = (match: number, profile = 'now'): ListingSummary => ({ match, profile, pros: [], cons: [] }) as unknown as ListingSummary;
const S = { followUpDays: 7 };
const st = (over: Partial<ListingState>): ListingState => ({ ...emptyState(), ...over });

describe('sorting deck', () => {
  const listings = [listing('low'), listing('high'), listing('later'), listing('unready'), listing('stale'), listing('closed', { open: false }), listing('yes'), listing('no')];
  const summaries = { low: card(30), high: card(90), later: card(95), stale: card(99, 'before'), yes: card(80), no: card(10) };
  const state = {
    later: st({ deferredAt: '2026-11-17T10:00:00Z' }),
    yes: withStatus(emptyState(), 'interested', '2026-11-17', S),
    no: withStatus(emptyState(), 'passed', '2026-11-17', S),
  };

  it('shows undecided open postings with a ready card: best match first, put-off ones last', () => {
    const d = deckOf({ listings, state, summaries, profile: 'now', includeUnready: false });
    expect(d.cards.map((l) => l.id)).toEqual(['high', 'low', 'later']);
    expect(d.waiting).toBe(2); // unready + stale (judged against older wishes)
  });
  it('includes postings without a ready card when not waiting for the AI', () => {
    const d = deckOf({ listings, state, summaries, profile: 'now', includeUnready: true });
    expect(d.cards.map((l) => l.id)).toEqual(['stale', 'high', 'unready', 'low', 'later']);
    expect(d.waiting).toBe(0);
  });
  it('falls back to the keyword fit when there is no AI match', () => {
    expect(matchOf(listing('a', { fit: 4 }), undefined)).toBe(80);
    expect(matchOf(listing('a', { fit: 4 }), card(55))).toBe(55);
  });
});

describe('deciding', () => {
  it('a decision ends "later", and the reason for passing does not outlive "passed"', () => {
    const later = st({ deferredAt: '2026-11-17T10:00:00Z' });
    expect(withStatus(later, 'interested', '2026-11-17', S).deferredAt).toBe('');
    const passed = { ...withStatus(emptyState(), 'passed', '2026-11-17', S), passReason: 'pay' };
    expect(withStatus(passed, 'interested', '2026-11-18', S).passReason).toBe('');
  });
});

describe('shortlist', () => {
  it('lists what I said yes to and have not contacted: top picks first, then by match', () => {
    const yes = (rating = 0) => ({ ...withStatus(emptyState(), 'interested', '2026-11-17', S), rating });
    const listings = [listing('ok'), listing('better'), listing('top'), listing('sent'), listing('gone', { open: false })];
    const state = { ok: yes(), better: yes(), top: yes(5), sent: withStatus(emptyState(), 'applied', '2026-11-17', S), gone: yes() };
    const summaries = { ok: card(50), better: card(70), top: card(40) };
    expect(shortlistOf({ listings, state, summaries }).map((l) => l.id)).toEqual(['top', 'better', 'ok']);
  });
});
