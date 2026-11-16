/** E-mails go through the mail program (mailto:); the app only logs that they were written. */
import type { EmailTemplateKind, ListingState } from '../shared/types';
import { emptyState } from '../shared/pipeline';
import { api, db } from './store';

/** Log an e-mail I just opened in my mail program. Returns the state before, for undo. */
export async function logEmail(listingId: string, kind: EmailTemplateKind, subject: string, docIds: string[]): Promise<ListingState> {
  // A plain copy: the reactive object may change under us.
  const before = JSON.parse(JSON.stringify(db.state[listingId] ?? emptyState())) as ListingState;
  db.state[listingId] = await api<ListingState>(`/state/${encodeURIComponent(listingId)}/emailed`, {
    method: 'POST',
    body: JSON.stringify({ kind, subject, docIds }),
  });
  return before;
}

/** Put back the state from before a mistaken log. */
export async function restoreState(listingId: string, prev: ListingState): Promise<void> {
  db.state[listingId] = await api<ListingState>(`/state/${encodeURIComponent(listingId)}/restore`, { method: 'PUT', body: JSON.stringify(prev) });
}
