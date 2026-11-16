/** Mail tables: messages, the thread → listing links, suggestions and sync bookkeeping. */
import type { MailClass, MailMessage, MailSuggestion, Status } from '../../shared/types.ts';
import { db } from '../store.ts';

type Row = Record<string, unknown>;
const json = <T>(v: unknown, fallback: T): T => (typeof v === 'string' && v ? (JSON.parse(v) as T) : fallback);

export interface StoredMessage extends MailMessage {
  rfcMessageId: string;
  inReplyTo: string;
  references: string;
  calendar: string;
  eventId: string | null;
  confidence: string;
  triage: '' | 'open' | 'done';
}

const toMessage = (r: Row): StoredMessage => ({
  id: r.id as string,
  threadId: r.thread_id as string,
  listingId: (r.listing_id as string | null) ?? null,
  companyId: (r.company_id as string | null) ?? null,
  direction: r.direction as 'in' | 'out',
  from: r.from_addr as string,
  fromName: r.from_name as string,
  to: json<string[]>(r.to_addrs, []),
  subject: r.subject as string,
  snippet: r.snippet as string,
  body: r.body as string,
  sentAt: r.sent_at as string,
  cls: r.cls as MailClass,
  attachments: json(r.attachments, []),
  hasInvite: !!r.calendar,
  matchReason: r.match_reason as string,
  rfcMessageId: r.rfc_message_id as string,
  inReplyTo: r.in_reply_to as string,
  references: r.refs as string,
  calendar: r.calendar as string,
  eventId: (r.event_id as string | null) ?? null,
  confidence: r.confidence as string,
  triage: (r.triage as StoredMessage['triage']) ?? '',
});

/** What the browser gets: no raw calendar data or bookkeeping. */
export const publicMessage = (m: StoredMessage): MailMessage => {
  const { rfcMessageId: _r, inReplyTo: _i, references: _f, calendar: _c, eventId: _e, confidence: _k, triage: _t, ...rest } = m;
  return rest;
};

export function saveMessage(m: StoredMessage): void {
  db()
    .prepare(
      `INSERT INTO messages (id, thread_id, listing_id, company_id, direction, from_addr, from_name, to_addrs, subject, snippet, body, sent_at,
        rfc_message_id, in_reply_to, refs, cls, calendar, attachments, event_id, match_reason, confidence, triage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET listing_id = excluded.listing_id, company_id = excluded.company_id, event_id = excluded.event_id,
        match_reason = excluded.match_reason, confidence = excluded.confidence, triage = excluded.triage, cls = excluded.cls`,
    )
    .run(
      m.id, m.threadId, m.listingId, m.companyId, m.direction, m.from, m.fromName, JSON.stringify(m.to), m.subject, m.snippet, m.body, m.sentAt,
      m.rfcMessageId, m.inReplyTo, m.references, m.cls, m.calendar, JSON.stringify(m.attachments), m.eventId, m.matchReason, m.confidence, m.triage,
    );
}

export const getMessage = (id: string): StoredMessage | null => {
  const r = db().prepare('SELECT * FROM messages WHERE id = ?').get(id) as Row | undefined;
  return r ? toMessage(r) : null;
};

export const hasMessage = (id: string): boolean => !!db().prepare('SELECT 1 FROM messages WHERE id = ?').get(id);

export const messagesOf = (listingId: string): StoredMessage[] =>
  (db().prepare("SELECT * FROM messages WHERE listing_id = ? AND triage <> 'open' ORDER BY sent_at").all(listingId) as Row[]).map(toMessage);

export const openTriage = (): StoredMessage[] =>
  (db().prepare("SELECT * FROM messages WHERE triage = 'open' ORDER BY sent_at DESC LIMIT 100").all() as Row[]).map(toMessage);

/** How many messages each listing has, for badges in the list. */
export const messageCounts = (): Record<string, number> =>
  Object.fromEntries((db().prepare('SELECT listing_id, COUNT(*) AS n FROM messages WHERE listing_id IS NOT NULL GROUP BY listing_id').all() as Row[]).map((r) => [r.listing_id as string, r.n as number]));

export function threadMap(): Map<string, string | null> {
  return new Map((db().prepare('SELECT id, listing_id FROM mail_threads').all() as Row[]).map((r) => [r.id as string, (r.listing_id as string | null) ?? null]));
}

export function rfcMap(): Map<string, string | null> {
  return new Map(
    (db().prepare("SELECT rfc_message_id, listing_id FROM messages WHERE rfc_message_id <> ''").all() as Row[]).map((r) => [r.rfc_message_id as string, (r.listing_id as string | null) ?? null]),
  );
}

export function linkThread(threadId: string, listingId: string | null, companyId: string | null, reason: string): void {
  db()
    .prepare(
      `INSERT INTO mail_threads (id, listing_id, company_id, match_reason) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET listing_id = excluded.listing_id, company_id = excluded.company_id, match_reason = excluded.match_reason`,
    )
    .run(threadId, listingId, companyId, reason);
}

// ---------- suggestions ----------

const toSuggestion = (r: Row): MailSuggestion => ({
  id: r.id as string,
  messageId: r.message_id as string,
  listingId: r.listing_id as string,
  status: r.status as Status,
  state: r.state as MailSuggestion['state'],
  createdAt: r.created_at as string,
});

export function addSuggestion(s: MailSuggestion): void {
  // One open suggestion per listing and status is enough.
  const dup = db().prepare("SELECT 1 FROM suggestions WHERE listing_id = ? AND status = ? AND state = 'pending'").get(s.listingId, s.status);
  if (dup) return;
  db().prepare('INSERT INTO suggestions (id, message_id, listing_id, status, state, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(s.id, s.messageId, s.listingId, s.status, s.state, s.createdAt);
}

export const pendingSuggestions = (): MailSuggestion[] =>
  (db().prepare("SELECT * FROM suggestions WHERE state = 'pending' ORDER BY created_at DESC").all() as Row[]).map(toSuggestion);

export const getSuggestion = (id: string): MailSuggestion | null => {
  const r = db().prepare('SELECT * FROM suggestions WHERE id = ?').get(id) as Row | undefined;
  return r ? toSuggestion(r) : null;
};

export const setSuggestionState = (id: string, state: MailSuggestion['state']) => db().prepare('UPDATE suggestions SET state = ? WHERE id = ?').run(state, id);

// ---------- sync bookkeeping ----------

export function syncGet(key: string): string {
  return ((db().prepare('SELECT value FROM mail_sync WHERE key = ?').get(key) as Row | undefined)?.value as string) ?? '';
}

export function syncSet(key: string, value: string): void {
  db().prepare('INSERT INTO mail_sync (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

/** Listing deleted: its mail stays, unlinked, so it can be assigned elsewhere. */
export function unlinkListing(listingId: string): void {
  db().prepare('UPDATE messages SET listing_id = NULL WHERE listing_id = ?').run(listingId);
  db().prepare('UPDATE mail_threads SET listing_id = NULL WHERE listing_id = ?').run(listingId);
  db().prepare('DELETE FROM suggestions WHERE listing_id = ?').run(listingId);
}

/** "Delete mail data": everything fetched from Gmail. */
export function wipeMail(): void {
  db().exec('DELETE FROM messages; DELETE FROM mail_threads; DELETE FROM suggestions; DELETE FROM mail_sync;');
}
