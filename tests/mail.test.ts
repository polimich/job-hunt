import { beforeEach, describe, expect, it } from 'vitest';
import { classify, companyCore, matchMessage, suggestedStatus, type MatchContext, type MailFacts } from '../shared/mail';
import { emptyState, withStatus } from '../shared/pipeline';
import type { Listing } from '../shared/types';
import { openDb } from '../server/db';
import { buildMessage, parseMessage, type Parsed } from '../server/mail/mime';
import { buildQuery, context, ingest } from '../server/mail/service';
import * as mailStore from '../server/mail/store';
import * as store from '../server/store';

const ctx = (over: Partial<MatchContext> = {}): MatchContext => ({
  threads: new Map(),
  messageIds: new Map(),
  contacts: [],
  companies: [
    { id: 'acme', name: 'Acme Czech Republic s.r.o.', domains: ['acme.cz'] },
    { id: 'deel', name: 'Deel', domains: [] },
  ],
  listings: [
    { id: 'acme-fe', companyId: 'acme', title: 'Frontend Developer', status: 'applied' },
    { id: 'acme-be', companyId: 'acme', title: 'Backend Engineer', status: 'interested' },
    { id: 'deel-fs', companyId: 'deel', title: 'Full Stack Engineer', status: 'interested' },
  ],
  ...over,
});
const mail = (over: Partial<MailFacts> = {}): MailFacts => ({
  threadId: 't1', outgoing: false, from: 'jana@acme.cz', fromName: 'Jana', to: ['me@gmail.com'], subject: 'Re: přihláška', body: '', inReplyTo: '', references: '', ...over,
});

describe('matching mail to applications', () => {
  it('follows known threads and replies first', () => {
    expect(matchMessage(mail({ from: 'x@gmail.com' }), ctx({ threads: new Map([['t1', 'deel-fs']]) }))).toMatchObject({ listingId: 'deel-fs', reason: 'vlákno', confidence: 'high' });
    expect(matchMessage(mail({ from: 'x@gmail.com', inReplyTo: '<a@b>' }), ctx({ messageIds: new Map([['<a@b>', 'acme-be']]) }))).toMatchObject({ listingId: 'acme-be', reason: 'odpověď' });
  });
  it('uses the company domain and picks the listing by title words or progress', () => {
    expect(matchMessage(mail({ subject: 'Backend Engineer – next steps' }), ctx())).toMatchObject({ listingId: 'acme-be', reason: 'doména firmy', confidence: 'high' });
    // No title hint: the one actually in progress (applied) wins, but only as a guess.
    expect(matchMessage(mail({ subject: 'Hello' }), ctx())).toMatchObject({ listingId: 'acme-fe', confidence: 'low' });
    expect(matchMessage(mail({ from: 'hr@sub.acme.cz', subject: 'Frontend role' }), ctx())).toMatchObject({ listingId: 'acme-fe', confidence: 'high' });
  });
  it('ignores personal mailboxes unless the person is a contact', () => {
    expect(matchMessage(mail({ from: 'recruiter@gmail.com' }), ctx())).toBeNull();
    expect(matchMessage(mail({ from: 'recruiter@gmail.com', subject: 'Frontend' }), ctx({ contacts: [{ email: 'Recruiter@gmail.com', companyId: 'acme' }] }))).toMatchObject({ listingId: 'acme-fe', reason: 'kontakt' });
  });
  it('reads the company from applicant-tracking mail', () => {
    const li = mail({ from: 'jobs-noreply@linkedin.com', fromName: 'LinkedIn', subject: 'Your application was sent to Deel' });
    expect(matchMessage(li, ctx())).toMatchObject({ listingId: 'deel-fs', reason: 'náborový systém', confidence: 'medium' });
    const gh = mail({ from: 'no-reply@us.greenhouse-mail.io', fromName: 'Acme Recruiting', subject: 'Thank you for applying', body: 'Frontend Developer' });
    expect(matchMessage(gh, ctx())).toMatchObject({ listingId: 'acme-fe' });
    expect(matchMessage(mail({ from: 'no-reply@greenhouse.io', fromName: 'Other Co' }), ctx())).toBeNull();
  });
  it('matches what I sent by the recipient', () => {
    expect(matchMessage(mail({ outgoing: true, from: 'me@gmail.com', to: ['jobs@acme.cz'], subject: 'Frontend Developer' }), ctx())).toMatchObject({ listingId: 'acme-fe' });
  });
  it('strips legal suffixes from company names', () => {
    expect(companyCore('Acme Czech Republic s.r.o.')).toBe('Acme');
    expect(companyCore('Red Hat Czech, s.r.o.')).toBe('Red Hat');
    expect(companyCore('KBC Group a.s.')).toBe('KBC Group');
  });
});

describe('classifying mail', () => {
  const c = (subject: string, body = '', from = 'jana@acme.cz', calendar = '') => classify({ outgoing: false, from, subject, body, calendar });
  it('tells rejection, invite, receipt, offer and replies apart', () => {
    expect(c('Vaše přihláška', 'Děkujeme za Váš zájem, bohužel jsme se rozhodli pro jiného kandidáta.')).toBe('rejection');
    expect(c('Thank you for applying', 'Unfortunately we will not be moving forward.')).toBe('rejection');
    expect(c('Thank you for applying to Acme', 'We have received your application.', 'no-reply@greenhouse.io')).toBe('receipt');
    expect(c('Vaše žádost byla odeslána společnosti Deel', '', 'jobs-noreply@linkedin.com')).toBe('receipt');
    expect(c('Pozvánka na pohovor', 'Kdy by se vám hodilo?')).toBe('invite');
    expect(c('Next steps', 'Pick a time here: https://calendly.com/acme/30min')).toBe('invite');
    expect(c('Invitation', '', 'cal@acme.cz', 'BEGIN:VCALENDAR')).toBe('invite');
    expect(c('Offer', 'We are pleased to offer you the position')).toBe('offer');
    expect(c('Úkol', 'Posíláme testovací úkol')).toBe('assignment');
    expect(c('Re: Frontend', 'Ahoj, díky za zprávu, zavoláme se?')).toBe('reply');
    expect(c('New jobs for you', '', 'jobalerts-noreply@linkedin.com')).toBe('reply');
    expect(c('Your application was viewed', '', 'notifications@acme.cz')).toBe('notification');
    expect(classify({ outgoing: true, from: 'me@gmail.com', subject: 'x', body: '' })).toBe('sent');
  });
  it('suggests the matching status, never backwards from an ending', () => {
    expect(suggestedStatus('rejection', 'applied')).toBe('rejected');
    expect(suggestedStatus('invite', 'talking')).toBe('interview');
    expect(suggestedStatus('invite', 'interview')).toBeNull();
    expect(suggestedStatus('reply', 'applied')).toBe('talking');
    expect(suggestedStatus('reply', 'interview')).toBeNull();
    expect(suggestedStatus('rejection', 'passed')).toBeNull();
    expect(suggestedStatus('offer', 'ghosted')).toBe('offer');
  });
});

describe('MIME', () => {
  it('builds a message Gmail can parse back, with a Czech subject and an attachment', () => {
    const { raw } = buildMessage({
      from: 'me@gmail.com', to: 'jobs@acme.cz', subject: 'Zájem o pozici Frontend', body: 'Dobrý den,\nposílám CV.',
      attachments: [{ fileName: 'CV Novák.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4') }], inReplyTo: '<p@acme.cz>',
    });
    const text = Buffer.from(raw, 'base64url').toString('utf8');
    expect(text).toContain('Subject: =?UTF-8?B?');
    expect(text).toContain('In-Reply-To: <p@acme.cz>');
    expect(text).toContain('Content-Type: multipart/mixed');
    expect(text).toContain(Buffer.from('%PDF-1.4').toString('base64'));
    expect(text).toContain(Buffer.from('Dobrý den,\r\nposílám CV.').toString('base64'));
  });
  it('removes line breaks from header values', () => {
    const text = Buffer.from(buildMessage({ from: 'me@gmail.com', to: 'a@b.cz\r\nBcc: x@y.cz', subject: 's', body: 'b' }).raw, 'base64url').toString('utf8');
    expect(text).not.toMatch(/^Bcc:/m);
  });
  it('reads plain text, html fallback, attachments and invitations', () => {
    const b = (s: string) => Buffer.from(s).toString('base64url');
    const p = parseMessage({
      id: 'm1', threadId: 't1', labelIds: ['INBOX'], internalDate: String(Date.parse('2026-11-16T10:00:00Z')), snippet: 'Ahoj',
      payload: {
        headers: [{ name: 'From', value: '"Jana Nováková" <Jana@Acme.cz>' }, { name: 'To', value: 'me@gmail.com, "X, Y" <x@y.cz>' }, { name: 'Subject', value: 'Pohovor' }, { name: 'Message-ID', value: '<id@acme.cz>' }],
        mimeType: 'multipart/mixed',
        parts: [
          { mimeType: 'text/html', body: { data: b('<p>Ahoj <b>Michale</b></p>') } },
          { mimeType: 'text/calendar', body: { data: b('BEGIN:VCALENDAR') } },
          { mimeType: 'application/pdf', filename: 'zadani.pdf', body: { attachmentId: 'att1', size: 1234 } },
        ],
      },
    });
    expect(p).toMatchObject({ from: 'jana@acme.cz', fromName: 'Jana Nováková', to: ['me@gmail.com', 'x@y.cz'], body: 'Ahoj Michale', calendar: 'BEGIN:VCALENDAR', outgoing: false, sentAt: '2026-11-16T10:00:00.000Z' });
    expect(p.attachments).toEqual([{ fileName: 'zadani.pdf', mime: 'application/pdf', size: 1234, attachmentId: 'att1' }]);
  });
});

describe('fetching and ingesting', () => {
  const listing = (id: string, companyId: string, title: string): Listing => ({
    id, companyId, company: companyId, title, url: '', source: 'other', sourceId: id, location: 'Brno', mode: '', place: 'local', contract: '', stack: '', tags: [],
    salaryPosted: '', benefits: '', fit: 3, fitSource: 'auto', recommended: false, strengths: '', weaknesses: '', vue: '', text: '', firstSeen: '2026-11-01', lastChecked: '2026-11-16', open: true,
  });
  const parsed = (over: Partial<Parsed>): Parsed => ({
    providerId: 'm1', threadId: 't1', from: 'jana@acme.cz', fromName: 'Jana', to: ['me@gmail.com'], subject: 'Re: Frontend', sentAt: new Date().toISOString(),
    rfcMessageId: '<m1@acme.cz>', inReplyTo: '', references: '', body: 'Ahoj, zavoláme se?', snippet: '', calendar: '', attachments: [], outgoing: false, ...over,
  });

  beforeEach(() => {
    store.useDb(openDb(':memory:'));
    store.saveCompanies([
      { id: 'acme', name: 'Acme s.r.o.', size: 'malá', emails: [{ address: 'jobs@acme.cz', kind: 'recruiting' }] },
      { id: 'deel', name: 'Deel', size: 'velká', emails: [] },
    ]);
    store.saveListings([listing('acme-fe', 'acme', 'Frontend Developer'), listing('deel-fs', 'deel', 'Full Stack Engineer')]);
    store.putState('acme-fe', withStatus(emptyState(), 'applied', '2026-11-10', { followUpDays: 7 }));
  });

  it('searches ATS senders, the job-hunt label and only domains of companies past "new"', () => {
    const c = context();
    const q = buildQuery('2026-10-17', c, c.states);
    expect(q.startsWith('after:2026/10/17 {')).toBe(true);
    expect(q).toContain('label:job-hunt');
    expect(q).toContain('greenhouse.io');
    expect(q).toContain('jobs-noreply@linkedin.com');
    // All of LinkedIn would be newsletters; only its application and message senders.
    expect(q).not.toMatch(/[ (]linkedin\.com/);
    expect(q).toContain('from:(acme.cz)');
  });

  it('logs a reply in the history, resets follow-ups and suggests "talking"', () => {
    store.putState('acme-fe', { ...store.getState('acme-fe')!, followUps: 1 });
    const m = ingest(parsed({}), context());
    expect(m).toMatchObject({ listingId: 'acme-fe', cls: 'reply', triage: '' });
    const st = store.getState('acme-fe')!;
    expect(st.events.at(-1)!.text).toBe('📩 Jana: Re: Frontend');
    expect(st.followUps).toBe(0);
    expect(st.nextNote).toBe('Odpovědět na e-mail: Jana');
    expect(mailStore.pendingSuggestions()).toMatchObject([{ listingId: 'acme-fe', status: 'talking' }]);
    // The next mail in the same thread follows it, even from a personal address.
    expect(ingest(parsed({ providerId: 'm2', from: 'jana.private@gmail.com', rfcMessageId: '<m2@x>' }), context()).listingId).toBe('acme-fe');
  });

  it('marks a listing applied from a portal confirmation', () => {
    const m = ingest(parsed({ from: 'jobs-noreply@linkedin.com', fromName: 'LinkedIn', subject: 'Your application was sent to Deel', body: '' }), context());
    expect(m.listingId).toBe('deel-fs');
    expect(store.getState('deel-fs')!.status).toBe('applied');
  });

  it('leaves unknown job mail for triage and can assign it', () => {
    const m = ingest(parsed({ threadId: 't9', providerId: 'm9', from: 'hr@other.cz', subject: 'Nabídka spolupráce', rfcMessageId: '' }), context());
    expect(m).toMatchObject({ listingId: null, triage: 'open' });
    expect(mailStore.messagesOf('deel-fs')).toEqual([]);
  });
});

describe('Google sign-in', () => {
  it('asks for offline read+send access with PKCE and a loopback redirect', async () => {
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const { authUrl, finishAuth } = await import('../server/mail/gmail');
    const url = new URL(authUrl(5174, 'http://localhost:5173/nastaveni'));
    const p = url.searchParams;
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(p.get('redirect_uri')).toBe('http://127.0.0.1:5174/api/mail/callback');
    expect(p.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send');
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(p.get('client_secret')).toBeNull();
    // A callback with a state the app did not issue is refused before calling Google.
    await expect(finishAuth(5174, 'code', 'forged')).rejects.toThrow('vypršelo');
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });
});
