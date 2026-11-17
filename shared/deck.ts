/** The sorting deck ("Třídit") and the shortlist ("Výběr"): which postings are in them, in what order. */
import type { Listing, ListingState, ListingSummary } from './types.ts';

export interface DeckInput {
  listings: Listing[];
  state: Record<string, ListingState>;
  summaries: Record<string, ListingSummary>;
  /** Hash of the wishes and profile right now (Db.summaryProfile). */
  profile: string;
  /** Show postings whose AI card is not ready too, with the basic facts only. */
  includeUnready: boolean;
}

export interface Deck {
  /** Cards to go through, best match first, the ones put off ("later") last. */
  cards: Listing[];
  /** Postings still waiting for their AI card. */
  waiting: number;
}

/** A card is ready when its summary was judged against the current wishes. */
export const cardReady = (s: ListingSummary | undefined, profile: string): boolean => !!s && s.profile === profile;

/** 0–100. The AI's match when there is one, otherwise the keyword fit (1–5) on the same scale. */
export const matchOf = (l: Listing, s: ListingSummary | undefined): number => (s?.profile ? s.match : l.fit * 20);

export function deckOf(d: DeckInput): Deck {
  const undecided = d.listings.filter((l) => l.open && (d.state[l.id]?.status ?? 'new') === 'new');
  const cards = d.includeUnready ? undecided : undecided.filter((l) => cardReady(d.summaries[l.id], d.profile));
  const later = (l: Listing) => d.state[l.id]?.deferredAt ?? '';
  cards.sort(
    (a, b) =>
      later(a).localeCompare(later(b)) || // '' (not put off) first, then in the order they were put off
      matchOf(b, d.summaries[b.id]) - matchOf(a, d.summaries[a.id]) ||
      b.firstSeen.localeCompare(a.firstSeen),
  );
  return { cards, waiting: undecided.length - cards.length };
}

/** Postings I said yes to and have not contacted yet: top picks first, then by match. */
export function shortlistOf(d: Pick<DeckInput, 'listings' | 'state' | 'summaries'>): Listing[] {
  return d.listings
    .filter((l) => l.open && d.state[l.id]?.status === 'interested')
    .sort(
      (a, b) =>
        (d.state[b.id]?.rating ?? 0) - (d.state[a.id]?.rating ?? 0) ||
        matchOf(b, d.summaries[b.id]) - matchOf(a, d.summaries[a.id]) ||
        b.firstSeen.localeCompare(a.firstSeen),
    );
}
