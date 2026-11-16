/** E-mail state and calls for the app: Gmail status, a listing's messages, triage, sending. */
import { ref } from 'vue';
import type { ListingState, MailDraft, MailMessage, MailStatus, MailTriage } from '../shared/types';
import { api, db, load } from './store';

export const mailStatus = ref<MailStatus>({ configured: false, connected: false, email: '', lastSyncAt: '', syncing: false, error: '' });
export const triage = ref<MailTriage>({ suggestions: [], unmatched: [] });
/** listing id → number of linked messages. */
export const mailCounts = ref<Record<string, number>>({});

export async function loadMailStatus(): Promise<MailStatus> {
  mailStatus.value = await api<MailStatus>('/mail/status');
  return mailStatus.value;
}

export async function loadTriage(): Promise<void> {
  if (!mailStatus.value.connected) return;
  [triage.value, mailCounts.value] = await Promise.all([api<MailTriage>('/mail/triage'), api<Record<string, number>>('/mail/counts')]);
}

export const messagesOf = (listingId: string) => api<MailMessage[]>(`/mail/listing/${encodeURIComponent(listingId)}`);

/** Pull new mail now, then reload what it may have changed (history, statuses, triage). */
export async function syncMail(): Promise<number> {
  const r = await api<{ added: number; status: MailStatus }>('/mail/sync', { method: 'POST' });
  mailStatus.value = r.status;
  if (r.added) await load();
  await loadTriage();
  return r.added;
}

export async function sendMail(draft: MailDraft): Promise<MailMessage> {
  const r = await api<{ message: MailMessage; state: ListingState }>('/mail/send', { method: 'POST', body: JSON.stringify(draft) });
  db.state[draft.listingId] = r.state;
  mailCounts.value = { ...mailCounts.value, [draft.listingId]: (mailCounts.value[draft.listingId] ?? 0) + 1 };
  return r.message;
}

export async function acceptSuggestion(id: string): Promise<void> {
  const s = triage.value.suggestions.find((x) => x.id === id);
  const st = await api<ListingState>(`/mail/suggestions/${id}/accept`, { method: 'POST' });
  if (s) db.state[s.listingId] = st;
  triage.value = { ...triage.value, suggestions: triage.value.suggestions.filter((x) => x.id !== id) };
}

export async function dismissSuggestion(id: string): Promise<void> {
  await api(`/mail/suggestions/${id}/dismiss`, { method: 'POST' });
  triage.value = { ...triage.value, suggestions: triage.value.suggestions.filter((x) => x.id !== id) };
}

export async function assignMessage(messageId: string, listingId: string): Promise<void> {
  await api(`/mail/messages/${messageId}/assign`, { method: 'POST', body: JSON.stringify({ listingId }) });
  await load();
  await loadTriage();
}

export async function ignoreMessage(messageId: string, sender = false): Promise<void> {
  await api(`/mail/messages/${messageId}/ignore`, { method: 'POST', body: JSON.stringify({ sender }) });
  triage.value = { ...triage.value, unmatched: triage.value.unmatched.filter((m) => m.id !== messageId && !(sender && m.from === triage.value.unmatched.find((x) => x.id === messageId)?.from)) };
}

export async function disconnectGmail(): Promise<void> {
  mailStatus.value = await api<MailStatus>('/mail/disconnect', { method: 'POST' });
}

export async function wipeMailData(): Promise<void> {
  mailStatus.value = await api<MailStatus>('/mail/data', { method: 'DELETE' });
  triage.value = { suggestions: [], unmatched: [] };
  mailCounts.value = {};
}

export const attachmentUrl = (messageId: string, attachmentId: string) => `/api/mail/messages/${messageId}/attachments/${attachmentId}`;
/** Open the message in Gmail's web UI. */
export const gmailUrl = (m: Pick<MailMessage, 'threadId'>) => `https://mail.google.com/mail/u/0/#all/${m.threadId}`;
