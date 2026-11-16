/**
 * The e-mail side of the app: send from a listing (with CV), pull job mail from Gmail every
 * few minutes, tie it to applications, log it in their history and suggest status changes.
 *
 * What gets fetched is deliberately narrow: mail from applicant-tracking systems and job
 * boards, mail to or from the domains of companies I am in touch with, replies in threads
 * the app knows, and anything I label "job-hunt" in Gmail. Not the whole inbox.
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { addDays, emptyState, ENDINGS, followedUp, newEventId, RANK, today, withEvent, withStatus } from '../../shared/pipeline.ts';
import { ATS_DOMAINS, classify, domainOf, isAts, isFreeMail, matchMessage, suggestedStatus, type MatchContext } from '../../shared/mail.ts';
import type { ListingState, MailClass, MailDraft, MailStatus, MailTriage, Status } from '../../shared/types.ts';
import { DOC_TYPES, docPath, getDoc, getState, loadCompanies, loadContacts, loadListings, loadSettings, loadState, putState, saveCompanies } from '../store.ts';
import * as gmail from './gmail.ts';
import { buildMessage, parseMessage, type Parsed } from './mime.ts';
import {
  addSuggestion, getMessage, getSuggestion, hasMessage, linkThread, openTriage, pendingSuggestions, publicMessage, rfcMap, saveMessage,
  setSuggestionState, syncGet, syncSet, threadMap, type StoredMessage,
} from './store.ts';

/** LinkedIn sends many newsletters; only these senders are about applications and messages. */
const LINKEDIN_SENDERS = ['jobs-noreply@linkedin.com', 'messages-noreply@linkedin.com', 'inmail-hit-reply@linkedin.com', 'hit-reply@linkedin.com'];
/** How far back the first sync looks. */
const BACKFILL_DAYS = 30;

let syncing = false;
let lastError = '';

export function status(): MailStatus {
  return {
    configured: gmail.isConfigured(),
    connected: gmail.isConnected(),
    email: syncGet('email'),
    lastSyncAt: syncGet('lastSyncAt'),
    syncing,
    error: lastError,
  };
}

/** After Google redirects back: remember the account and where history starts, then sync. */
export async function connected(): Promise<void> {
  const p = await gmail.profile();
  syncSet('email', p.emailAddress.toLowerCase());
  syncSet('historyId', p.historyId);
  if (!syncGet('since')) syncSet('since', addDays(today(), -BACKFILL_DAYS));
  lastError = '';
  void sync();
}

export async function disconnect(): Promise<void> {
  await gmail.disconnect();
  syncSet('historyId', '');
}

// ---------- context for matching ----------

export function context(): MatchContext & { states: Record<string, ListingState> } {
  const states = loadState();
  const contacts = loadContacts().filter((c) => c.email);
  const companies = loadCompanies().map((c) => ({
    id: c.id,
    name: c.name,
    domains: [...new Set([...c.emails.map((e) => e.address), ...contacts.filter((x) => x.companyId === c.id).map((x) => x.email)].filter((a) => !isFreeMail(a) && !isAts(a)).map(domainOf).filter(Boolean))],
  }));
  return {
    states,
    threads: threadMap(),
    messageIds: rfcMap(),
    contacts: contacts.map((c) => ({ email: c.email, companyId: c.companyId })),
    companies,
    listings: loadListings().map((l) => ({ id: l.id, companyId: l.companyId, title: l.title, status: states[l.id]?.status ?? 'new' })),
  };
}

/**
 * The Gmail search for job mail since a date. Company domains count only for companies I
 * have moved past "new" with, so a company's newsletter does not flood the app.
 */
export function buildQuery(after: string, ctx: Pick<MatchContext, 'companies' | 'listings'>, states: Record<string, ListingState>): string {
  const engaged = new Set(ctx.listings.filter((l) => (states[l.id]?.status ?? 'new') !== 'new').map((l) => l.companyId));
  const domains = [...new Set(ctx.companies.filter((c) => engaged.has(c.id)).flatMap((c) => c.domains))].slice(0, 80);
  const ats = ATS_DOMAINS.filter((d) => d !== 'linkedin.com');
  const or = (xs: string[]) => `(${xs.join(' OR ')})`;
  const parts = [`from:${or([...ats, ...LINKEDIN_SENDERS])}`, 'label:job-hunt'];
  if (domains.length) parts.push(`from:${or(domains)}`, `to:${or(domains)}`);
  return `after:${after.replaceAll('-', '/')} {${parts.join(' ')}}`;
}

// ---------- applying a message to a listing ----------

const who = (p: { fromName: string; from: string }) => p.fromName || p.from;
const HUMAN: MailClass[] = ['reply', 'invite', 'assignment', 'offer'];

/** Log the mail in the listing's history and react to it. Returns the history entry's id. */
function applyToListing(listingId: string, p: Pick<Parsed, 'outgoing' | 'from' | 'fromName' | 'subject' | 'sentAt'>, cls: MailClass, messageId: string): string {
  const settings = loadSettings();
  const on = today();
  const day = p.sentAt.slice(0, 10);
  let st = getState(listingId) ?? emptyState();
  st = withEvent(st, { kind: 'message', at: day, text: p.outgoing ? `📤 ${p.subject}` : `📩 ${who(p)}: ${p.subject}` }, on, settings);
  const eventId = st.events.at(-1)!.id;
  const suggest = (status: Status) => addSuggestion({ id: newEventId(), messageId, listingId, status, state: 'pending', createdAt: new Date().toISOString() });
  if (p.outgoing) {
    if (st.status === 'new' || st.status === 'interested') suggest('applied');
  } else {
    // A confirmation from a portal or Easy Apply is proof the application went out.
    if (cls === 'receipt' && (st.status === 'new' || st.status === 'interested')) st = withStatus(st, 'applied', day, settings);
    if (HUMAN.includes(cls)) {
      st = { ...st, followUps: 0 };
      // Only fresh mail asks for an answer; the first sync also reads a month of history.
      if (day >= addDays(on, -3)) st = { ...st, nextAt: on, nextNote: `Odpovědět na e-mail: ${who(p)}` };
    }
    const next = suggestedStatus(cls, st.status);
    if (next) suggest(next);
  }
  putState(listingId, { ...st, updatedAt: new Date().toISOString() });
  return eventId;
}

function toStored(p: Parsed, cls: MailClass): StoredMessage {
  return {
    id: p.providerId,
    threadId: p.threadId,
    listingId: null,
    companyId: null,
    direction: p.outgoing ? 'out' : 'in',
    from: p.from,
    fromName: p.fromName,
    to: p.to,
    subject: p.subject,
    snippet: p.snippet,
    body: p.body,
    sentAt: p.sentAt,
    cls,
    attachments: p.attachments,
    hasInvite: !!p.calendar,
    matchReason: '',
    rfcMessageId: p.rfcMessageId,
    inReplyTo: p.inReplyTo,
    references: p.references,
    calendar: p.calendar,
    eventId: null,
    confidence: '',
    triage: '',
  };
}

const ignored = (): string[] => JSON.parse(syncGet('ignored') || '[]') as string[];

/** Store one fetched message, tie it to a listing when sure, otherwise leave it for triage. */
export function ingest(p: Parsed, ctx: ReturnType<typeof context>): StoredMessage {
  const cls = classify({ outgoing: p.outgoing, from: p.from, subject: p.subject, body: p.body, calendar: p.calendar });
  const m = toStored(p, cls);
  if (!p.outgoing && ignored().includes(p.from)) {
    saveMessage(m);
    return m;
  }
  const match = matchMessage({ ...p }, ctx);
  m.companyId = match?.companyId ?? null;
  m.matchReason = match?.reason ?? '';
  m.confidence = match?.confidence ?? '';
  if (match?.listingId && match.confidence !== 'low') {
    m.listingId = match.listingId;
    m.eventId = applyToListing(match.listingId, p, cls, m.id);
    linkThread(p.threadId, match.listingId, match.companyId, match.reason);
    ctx.threads.set(p.threadId, match.listingId);
  } else if (match?.listingId) {
    // A guess: shown in triage as "belongs to …?", not in the listing yet.
    m.listingId = match.listingId;
    m.triage = 'open';
  } else if (cls !== 'notification' && cls !== 'sent') {
    m.triage = 'open';
  }
  if (p.rfcMessageId) ctx.messageIds.set(p.rfcMessageId, m.triage === 'open' ? null : m.listingId);
  saveMessage(m);
  return m;
}

/** Pull new job mail. Safe to call often; one run at a time. */
export async function sync(): Promise<{ added: number }> {
  if (syncing || !gmail.isConnected()) return { added: 0 };
  syncing = true;
  try {
    const ctx = context();
    const wanted = new Map<string, string>();

    // Replies in threads the app already knows, even from personal addresses.
    const historyId = syncGet('historyId');
    const since = historyId ? await gmail.addedSince(historyId) : null;
    if (since) {
      for (const m of since.messages) if (ctx.threads.has(m.threadId) && !hasMessage(m.id)) wanted.set(m.id, m.threadId);
      syncSet('historyId', since.historyId);
    } else {
      syncSet('historyId', (await gmail.profile()).historyId);
    }

    // Job mail by sender, company domain or label.
    const first = !syncGet('lastSyncAt');
    const after = first ? syncGet('since') || addDays(today(), -BACKFILL_DAYS) : addDays(syncGet('lastSyncAt').slice(0, 10), -2);
    for (const m of await gmail.search(buildQuery(after, ctx, ctx.states), first ? 400 : 150)) if (!hasMessage(m.id)) wanted.set(m.id, m.threadId);

    const parsed: Parsed[] = [];
    for (const id of wanted.keys()) parsed.push(parseMessage(await gmail.message(id)));
    parsed.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    for (const p of parsed) ingest(p, ctx);

    syncSet('lastSyncAt', new Date().toISOString());
    lastError = '';
    return { added: parsed.length };
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    syncing = false;
  }
}

// ---------- sending ----------

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export async function send(d: MailDraft): Promise<{ message: ReturnType<typeof publicMessage>; state: ListingState }> {
  const listing = loadListings().find((l) => l.id === d.listingId);
  if (!listing) throw new Error('Pozice nenalezena');
  const to = d.to.trim();
  if (!EMAIL.test(to)) throw new Error('Neplatná adresa příjemce');
  if (!d.subject.trim() || !d.body.trim()) throw new Error('Chybí předmět nebo text');
  const docs = d.docIds.map((id) => getDoc(id)).filter((x) => !!x);
  for (const doc of docs) if (!existsSync(docPath(doc))) throw new Error(`Soubor „${doc.label}“ chybí na disku`);
  const parent = d.replyTo ? getMessage(d.replyTo) : null;

  let me = syncGet('email');
  if (!me) {
    me = (await gmail.profile()).emailAddress.toLowerCase();
    syncSet('email', me);
  }
  const { raw, messageId } = buildMessage({
    from: me,
    to,
    subject: d.subject.trim(),
    body: d.body,
    attachments: docs.map((doc) => ({ fileName: doc.fileName, mime: (DOC_TYPES[extname(doc.fileName).toLowerCase()] ?? 'application/octet-stream').split(';')[0]!, data: readFileSync(docPath(doc)) })),
    inReplyTo: parent?.rfcMessageId || undefined,
    references: parent?.references || undefined,
  });
  const sent = await gmail.send(raw, parent?.threadId);

  // History: an intro is the application; a follow-up counts as one; anything else is a message.
  const settings = loadSettings();
  const on = today();
  let st = getState(listing.id) ?? emptyState();
  if (d.kind === 'followUp') {
    st = followedUp(st, on, settings);
    st.events[st.events.length - 1] = { ...st.events.at(-1)!, text: `📤 Připomenutí: ${d.subject.trim()}` };
  } else {
    st = withEvent(st, { kind: 'message', at: on, text: `📤 ${d.subject.trim()}` }, on, settings);
  }
  const eventId = st.events.at(-1)!.id;
  if (d.kind === 'intro' && (RANK[st.status] ?? 0) < (RANK.applied ?? 0) && !ENDINGS.includes(st.status)) st = withStatus(st, 'applied', on, settings);
  st = { ...st, docIds: [...new Set([...st.docIds, ...docs.map((x) => x.id)])], updatedAt: new Date().toISOString() };
  putState(listing.id, st);

  const stored: StoredMessage = {
    id: sent.id,
    threadId: sent.threadId,
    listingId: listing.id,
    companyId: listing.companyId,
    direction: 'out',
    from: me,
    fromName: '',
    to: [to.toLowerCase()],
    subject: d.subject.trim(),
    snippet: d.body.slice(0, 200),
    body: d.body,
    sentAt: new Date().toISOString(),
    cls: 'sent',
    attachments: docs.map((doc) => ({ fileName: doc.fileName, mime: '', size: doc.size, attachmentId: '' })),
    hasInvite: false,
    matchReason: 'odesláno z aplikace',
    rfcMessageId: messageId,
    inReplyTo: parent?.rfcMessageId ?? '',
    references: parent?.references ?? '',
    calendar: '',
    eventId,
    confidence: 'high',
    triage: '',
  };
  // Gmail may assign its own Message-ID; replies refer to that one.
  try {
    const meta = await gmail.metadata(sent.id);
    const id = meta.payload?.headers?.find((h) => h.name.toLowerCase() === 'message-id')?.value;
    if (id) stored.rfcMessageId = id;
  } catch {
    /* keep ours */
  }
  saveMessage(stored);
  linkThread(sent.threadId, listing.id, listing.companyId, 'odesláno z aplikace');

  // A new company address helps match their replies by domain.
  if (!isFreeMail(to) && !isAts(to)) {
    const companies = loadCompanies();
    const company = companies.find((c) => c.id === listing.companyId);
    if (company && !company.emails.some((e) => e.address.toLowerCase() === to.toLowerCase())) {
      company.emails.push({ address: to, kind: 'person', note: 'z odeslaného e-mailu' });
      saveCompanies(companies);
    }
  }
  return { message: publicMessage(stored), state: st };
}

// ---------- triage ----------

export function triage(): MailTriage {
  const suggestions = pendingSuggestions()
    .map((s) => ({ ...s, message: getMessage(s.messageId) }))
    .filter((s): s is typeof s & { message: StoredMessage } => !!s.message)
    .map((s) => ({ ...s, message: publicMessage(s.message) }));
  return { suggestions, unmatched: openTriage().map(publicMessage) };
}

export function acceptSuggestion(id: string): ListingState {
  const s = getSuggestion(id);
  if (!s || s.state !== 'pending') throw new Error('Návrh nenalezen');
  const on = today();
  const st = withStatus(getState(s.listingId) ?? emptyState(), s.status, on, loadSettings());
  putState(s.listingId, { ...st, updatedAt: new Date().toISOString() });
  setSuggestionState(id, 'accepted');
  return st;
}

export const dismissSuggestion = (id: string) => setSuggestionState(id, 'dismissed');

/** Assign a triage message (and the rest of its thread) to a listing. */
export function assign(messageId: string, listingId: string): void {
  const m = getMessage(messageId);
  const listing = loadListings().find((l) => l.id === listingId);
  if (!m || !listing) throw new Error('Nenalezeno');
  linkThread(m.threadId, listing.id, listing.companyId, 'přiřazeno ručně');
  const thread = [m, ...openTriage().filter((x) => x.threadId === m.threadId && x.id !== m.id)];
  for (const x of thread.sort((a, b) => a.sentAt.localeCompare(b.sentAt))) {
    x.listingId = listing.id;
    x.companyId = listing.companyId;
    x.matchReason = 'přiřazeno ručně';
    x.confidence = 'high';
    x.triage = 'done';
    x.eventId = applyToListing(listing.id, { outgoing: x.direction === 'out', from: x.from, fromName: x.fromName, subject: x.subject, sentAt: x.sentAt }, x.cls, x.id);
    saveMessage(x);
  }
}

/** Hide a triage message; with `sender`, also every future mail from that address. */
export function ignore(messageId: string, sender = false): void {
  const m = getMessage(messageId);
  if (!m) throw new Error('Nenalezeno');
  m.triage = 'done';
  if (m.confidence === 'low') m.listingId = null;
  saveMessage(m);
  if (sender) syncSet('ignored', JSON.stringify([...new Set([...ignored(), m.from])]));
}

export async function attachmentData(messageId: string, attachmentId: string): Promise<{ data: Buffer; fileName: string; mime: string }> {
  const m = getMessage(messageId);
  const a = m?.attachments.find((x) => x.attachmentId === attachmentId);
  if (!m || !a) throw new Error('Nenalezeno');
  return { data: await gmail.attachment(m.id, attachmentId), fileName: a.fileName, mime: a.mime || 'application/octet-stream' };
}
