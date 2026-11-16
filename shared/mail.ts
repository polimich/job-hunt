/**
 * Which application an e-mail belongs to, and what kind of e-mail it is. Pure functions:
 * the server feeds them what it knows (threads, contacts, company addresses, listings).
 */
import { fold, hasPhrase } from './search.ts';
import type { MailClass, Status } from './types.ts';

/** Personal mailboxes: their domain says nothing about the company. */
export const FREE_MAIL = [
  'gmail.com', 'googlemail.com', 'seznam.cz', 'email.cz', 'post.cz', 'centrum.cz', 'atlas.cz', 'volny.cz', 'tiscali.cz',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
];

/**
 * Applicant-tracking systems and job boards that send mail on a company's behalf. The
 * company is then read from the sender name, subject or text.
 */
export const ATS_DOMAINS = [
  'greenhouse.io', 'greenhouse-mail.io', 'grnh.se', 'lever.co', 'workablemail.com', 'workable.com', 'smartrecruiters.com',
  'recruitee.com', 'personio.de', 'personio.com', 'teamtailor.com', 'teamtailor-mail.com', 'ashbyhq.com', 'bamboohr.com',
  'myworkday.com', 'workday.com', 'breezy.hr', 'jobvite.com', 'icims.com', 'successfactors.com', 'successfactors.eu',
  'taleo.net', 'comeet.co', 'homerun.co', 'join.com', 'traffit.com', 'recruitcrm.io', 'gem.com', 'pinpointhq.com',
  'teamio.com', 'lmc.cz', 'jobs.cz', 'prace.cz', 'startupjobs.cz', 'linkedin.com', 'welcometothejungle.com', 'cocuma.cz',
];

export const domainOf = (address: string): string => address.split('@')[1]?.toLowerCase().trim() ?? '';
const under = (domain: string, base: string) => domain === base || domain.endsWith(`.${base}`);
export const isFreeMail = (address: string) => FREE_MAIL.some((d) => under(domainOf(address), d));
export const isAts = (address: string) => ATS_DOMAINS.some((d) => under(domainOf(address), d));

/** "Acme Czech Republic s.r.o." → "Acme": the part people actually write. */
export function companyCore(name: string): string {
  return name
    .replace(/,?\s*(s\.\s?r\.\s?o\.?|spol\.?|a\.\s?s\.?|k\.\s?s\.?|v\.\s?o\.\s?s\.?|se|gmbh|inc\.?|ltd\.?|llc|b\.v\.|ag|plc|corp\.?|o\.p\.s\.|z\.s\.)\s*$/gi, '')
    .replace(/\b(czech republic|czechia|česká republika|cz|czech)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchListing {
  id: string;
  companyId: string;
  title: string;
  status: Status;
}

export interface MatchContext {
  /** Gmail thread id → listing it belongs to (null = company known, listing not). */
  threads: Map<string, string | null>;
  /** RFC Message-ID → listing. */
  messageIds: Map<string, string | null>;
  contacts: { email: string; companyId: string }[];
  companies: { id: string; name: string; domains: string[] }[];
  listings: MatchListing[];
}

export interface MailFacts {
  threadId: string;
  outgoing: boolean;
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  body: string;
  inReplyTo: string;
  references: string;
}

export interface Match {
  listingId: string | null;
  companyId: string | null;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

const ACTIVE_FIRST: Status[] = ['interview', 'talking', 'applied', 'offer', 'interested', 'new'];
const CLOSED: Status[] = ['accepted', 'passed', 'rejected', 'ghosted', 'closed'];

/** Of a company's listings, the one the mail is about: by title words, then by being in progress. */
function pickListing(companyId: string, text: string, ctx: MatchContext): { id: string | null; sure: boolean } {
  const mine = ctx.listings.filter((l) => l.companyId === companyId);
  if (mine.length <= 1) return { id: mine[0]?.id ?? null, sure: mine.length === 1 };
  const words = (t: string) => fold(t).split(/[^a-z0-9+#]+/).filter((w) => w.length > 3 && !['senior', 'junior', 'developer', 'engineer'].includes(w));
  const scored = mine.map((l) => ({ l, n: words(l.title).filter((w) => hasPhrase(text, w)).length })).sort((a, b) => b.n - a.n);
  if (scored[0]!.n > 0 && scored[0]!.n > (scored[1]?.n ?? 0)) return { id: scored[0]!.l.id, sure: true };
  const open = mine.filter((l) => !CLOSED.includes(l.status)).sort((a, b) => ACTIVE_FIRST.indexOf(a.status) - ACTIVE_FIRST.indexOf(b.status));
  const best = open[0];
  if (best && open.filter((l) => l.status === best.status).length === 1 && best.status !== 'new' && best.status !== 'interested') return { id: best.id, sure: false };
  return { id: null, sure: false };
}

export function matchMessage(m: MailFacts, ctx: MatchContext): Match | null {
  if (ctx.threads.has(m.threadId)) {
    const listingId = ctx.threads.get(m.threadId) ?? null;
    const companyId = ctx.listings.find((l) => l.id === listingId)?.companyId ?? null;
    return { listingId, companyId, reason: 'vlákno', confidence: 'high' };
  }
  for (const id of [m.inReplyTo, ...m.references.split(/\s+/)].filter(Boolean)) {
    if (ctx.messageIds.has(id)) {
      const listingId = ctx.messageIds.get(id) ?? null;
      return { listingId, companyId: ctx.listings.find((l) => l.id === listingId)?.companyId ?? null, reason: 'odpověď', confidence: 'high' };
    }
  }
  const text = `${m.subject}\n${m.body.slice(0, 4000)}`;
  const others = (m.outgoing ? m.to : [m.from]).map((a) => a.toLowerCase());
  const withListing = (companyId: string, reason: string, base: Match['confidence']): Match => {
    const pick = pickListing(companyId, text, ctx);
    return { listingId: pick.id, companyId, reason, confidence: pick.id ? (pick.sure ? base : 'low') : 'low' };
  };

  const contact = ctx.contacts.find((c) => others.includes(c.email.toLowerCase()));
  if (contact) return withListing(contact.companyId, 'kontakt', 'high');

  for (const a of others) {
    if (isFreeMail(a) || isAts(a)) continue;
    const d = domainOf(a);
    const company = ctx.companies.find((c) => c.domains.some((x) => under(d, x) || under(x, d)));
    if (company) return withListing(company.id, 'doména firmy', 'high');
  }

  if (!m.outgoing && isAts(m.from)) {
    // The company name in sender name or subject is a strong hint; in the body a weaker one.
    const named = (where: string) =>
      ctx.companies
        .map((c) => ({ c, core: companyCore(c.name) }))
        .filter(({ core }) => core.length >= 3 && hasPhrase(where, core))
        .sort((a, b) => b.core.length - a.core.length)[0]?.c;
    const strong = named(`${m.fromName}\n${m.subject}`);
    const company = strong ?? named(m.body.slice(0, 3000));
    if (company) return withListing(company.id, 'náborový systém', strong ? 'medium' : 'low');
  }
  return null;
}

// ---------- classification ----------

const any = (text: string, phrases: string[]) => phrases.some((p) => text.includes(p));

const REJECTION = [
  'bohuzel', 'jineho kandidata', 'jine kandidaty', 'nebudeme pokracovat', 'nepostoupil', 'pozice byla obsazena', 'rozhodli jsme se pokracovat s',
  'unfortunately', 'not moving forward', 'not to move forward', 'move forward with other', 'other candidates', 'won\'t be moving forward',
  'will not be moving forward', 'position has been filled', 'regret to inform', 'not be progressing', 'not been selected', 'decided not to proceed',
];
const OFFER = ['job offer', 'offer letter', 'pleased to offer', 'happy to offer', 'excited to offer', 'nabidku prace', 'pracovni nabidku vam', 'radi bychom vam nabidli', 'smlouvu k podpisu'];
const INVITE = [
  'calendly.com', 'meet.google.com', 'teams.microsoft.com', 'zoom.us/j', 'cal.com/', 'invite you to', 'invite you for', 'like to schedule',
  'schedule a call', 'schedule an interview', 'book a time', 'pick a time', 'availability for', 'pozvat na pohovor', 'pozvanka na pohovor',
  'pozvat vas', 'domluvit termin', 'domluvit si termin', 'termin pohovoru', 'kdy by se vam hodilo', 'osobni schuzk', 'videohovor',
];
const RECEIPT = [
  'thank you for applying', 'thanks for applying', 'thank you for your application', 'received your application', 'your application was sent',
  'application has been received', 'application has been submitted', 'dekujeme za vas zajem', 'dekujeme za vasi prihlasku', 'dekujeme za zaslani',
  'potvrzujeme prijeti', 'obdrzeli jsme vas', 'odpoved na inzerat', 'vase zadost byla odeslana', 'vase prihlaska byla odeslana', 'zivotopis jsme obdrzeli',
];
const ASSIGNMENT = ['home assignment', 'take-home', 'take home', 'technical task', 'coding challenge', 'test assignment', 'technical assignment', 'ukol na doma', 'testovaci ukol', 'zadani ukolu'];
const NOTIFICATION = /^(no-?reply|noreply|do-not-reply|donotreply|notifications?|jobs-noreply|mailer-daemon|alerts?|info|news)/;

/** Rules first; the order matters (a rejection often says "thank you for applying" too). */
export function classify(m: { outgoing: boolean; from: string; subject: string; body: string; calendar?: string }): MailClass {
  if (m.outgoing) return 'sent';
  const text = fold(`${m.subject}\n${m.body.slice(0, 6000)}`);
  if (any(text, REJECTION)) return 'rejection';
  if (any(text, OFFER)) return 'offer';
  if (m.calendar || any(text, INVITE)) return 'invite';
  if (any(text, RECEIPT)) return 'receipt';
  if (any(text, ASSIGNMENT)) return 'assignment';
  if (NOTIFICATION.test(m.from.split('@')[0] ?? '')) return 'notification';
  return 'reply';
}

/** The status an e-mail suggests for the listing it belongs to, or null. */
export function suggestedStatus(cls: MailClass, current: Status): Status | null {
  if (CLOSED.includes(current) && cls !== 'offer') return null;
  if (cls === 'rejection') return 'rejected';
  if (cls === 'offer') return current === 'offer' ? null : 'offer';
  if (cls === 'invite') return current === 'interview' || current === 'offer' ? null : 'interview';
  if ((cls === 'reply' || cls === 'assignment') && (current === 'applied' || current === 'interested' || current === 'new')) return 'talking';
  return null;
}
