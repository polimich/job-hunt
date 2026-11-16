/** Building outgoing RFC 5322 messages and reading Gmail's parsed message structure. */
import { randomBytes } from 'node:crypto';
import { htmlToText } from '../http.ts';
import type { GmailMessage, GmailPart } from './gmail.ts';

/** RFC 2047 encoded-word for a header that may contain non-ASCII. */
export function encodeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

const wrap = (b64: string) => b64.replace(/.{1,76}/g, '$&\r\n');

/** One header line; CR/LF in values would let a value inject headers, so they are removed. */
const header = (name: string, value: string) => `${name}: ${value.replace(/[\r\n]+/g, ' ')}`;

export interface Outgoing {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments?: { fileName: string; mime: string; data: Buffer }[];
  /** Message-ID of the mail this replies to, for threading in every client. */
  inReplyTo?: string;
  references?: string;
}

export function buildMessage(m: Outgoing): { raw: string; messageId: string } {
  const domain = m.from.split('@')[1] ?? 'localhost';
  const messageId = `<${randomBytes(12).toString('hex')}@${domain}>`;
  const head = [
    header('From', m.from),
    header('To', m.to),
    header('Subject', encodeHeader(m.subject)),
    header('Message-ID', messageId),
    header('Date', new Date().toUTCString().replace('GMT', '+0000')),
    'MIME-Version: 1.0',
  ];
  if (m.inReplyTo) head.push(header('In-Reply-To', m.inReplyTo), header('References', [m.references, m.inReplyTo].filter(Boolean).join(' ')));
  const text = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(Buffer.from(m.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64'))].join('\r\n');
  let mime: string;
  if (!m.attachments?.length) {
    mime = [...head, text].join('\r\n');
  } else {
    const boundary = `jh-${randomBytes(10).toString('hex')}`;
    const parts = m.attachments.map((a) => {
      const name = encodeHeader(a.fileName).replace(/"/g, '');
      return [
        `Content-Type: ${a.mime}; name="${name}"`,
        `Content-Disposition: attachment; filename="${name}"`,
        'Content-Transfer-Encoding: base64',
        '',
        wrap(a.data.toString('base64')),
      ].join('\r\n');
    });
    mime = [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, text, ...parts.map((p) => `--${boundary}\r\n${p}`), `--${boundary}--`, ''].join('\r\n');
  }
  return { raw: Buffer.from(mime, 'utf8').toString('base64url'), messageId };
}

export interface Parsed {
  providerId: string;
  threadId: string;
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  sentAt: string;
  rfcMessageId: string;
  inReplyTo: string;
  references: string;
  body: string;
  snippet: string;
  /** Raw text/calendar content when the mail carries an invitation. */
  calendar: string;
  attachments: { fileName: string; mime: string; size: number; attachmentId: string }[];
  /** Sent by me (Gmail SENT label). */
  outgoing: boolean;
}

/** "Jana Nováková <jana@acme.cz>" → address and name. */
export function splitAddress(v: string): { address: string; name: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v);
  if (m) return { name: decodeWords(m[1]!.trim()), address: m[2]!.trim().toLowerCase() };
  return { name: '', address: v.trim().toLowerCase() };
}

export const addressList = (v: string): string[] =>
  v
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((x) => splitAddress(x).address)
    .filter((x) => x.includes('@'));

/** Gmail already decodes headers, but names in "From" may still hold encoded words. */
function decodeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, _cs: string, enc: string, data: string) =>
    enc.toUpperCase() === 'B' ? Buffer.from(data, 'base64').toString('utf8') : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'),
  );
}

const MAX_BODY = 20_000;

export function parseMessage(m: GmailMessage): Parsed {
  const headers = new Map((m.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const h = (n: string) => headers.get(n) ?? '';
  const plain: string[] = [];
  const html: string[] = [];
  let calendar = '';
  const attachments: Parsed['attachments'] = [];
  const walk = (p: GmailPart) => {
    const type = (p.mimeType ?? '').toLowerCase();
    if (p.filename && p.body?.attachmentId) {
      attachments.push({ fileName: p.filename, mime: type, size: p.body.size ?? 0, attachmentId: p.body.attachmentId });
    } else if (p.body?.data) {
      const text = Buffer.from(p.body.data, 'base64url').toString('utf8');
      if (type === 'text/plain') plain.push(text);
      else if (type === 'text/html') html.push(text);
      else if (type === 'text/calendar') calendar ||= text;
    }
    for (const c of p.parts ?? []) walk(c);
  };
  if (m.payload) walk(m.payload);
  const body = (plain.length ? plain.join('\n\n') : htmlToText(html.join('\n'))).replace(/\r\n/g, '\n').trim().slice(0, MAX_BODY);
  const from = splitAddress(h('from'));
  return {
    providerId: m.id,
    threadId: m.threadId,
    from: from.address,
    fromName: from.name,
    to: [...addressList(h('to')), ...addressList(h('cc'))],
    subject: h('subject'),
    sentAt: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date(h('date')).toISOString(),
    rfcMessageId: h('message-id'),
    inReplyTo: h('in-reply-to'),
    references: h('references'),
    body,
    snippet: m.snippet ?? body.slice(0, 200),
    calendar,
    attachments,
    outgoing: (m.labelIds ?? []).includes('SENT'),
  };
}
