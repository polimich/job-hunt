/**
 * Gmail through Google's REST API, signed in with OAuth as a "Desktop app" client:
 * the browser goes to Google, Google redirects back to this server on 127.0.0.1 with a code,
 * and the code is exchanged (with PKCE) for a refresh token kept by secrets.ts.
 *
 * Scopes: gmail.readonly (read job mail) and gmail.send (send from the app). Setup steps are
 * in the README ("Gmail"). Client id and secret come from .env.
 */
import { createHash, randomBytes } from 'node:crypto';
import { deleteSecret, getSecret, setSecret } from './secrets.ts';

export const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const TOKEN_NAME = 'gmail-refresh-token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export const isConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
export const isConnected = () => isConfigured() && !!getSecret(TOKEN_NAME);

export const redirectUri = (port: number) => `http://127.0.0.1:${port}/api/mail/callback`;

/** Sign-ins in progress: state → PKCE verifier and where to send the browser afterwards. */
const pending = new Map<string, { verifier: string; back: string; at: number }>();

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function authUrl(port: number, back: string): string {
  const state = b64url(randomBytes(16));
  const verifier = b64url(randomBytes(48));
  for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60_000) pending.delete(k);
  pending.set(state, { verifier, back, at: Date.now() });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(port),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

let access: { token: string; until: number } | undefined;

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    if (data.error === 'invalid_grant') {
      // Revoked or expired: forget it so the UI offers to connect again.
      deleteSecret(TOKEN_NAME);
      throw new Error('Přístup ke Gmailu vypršel nebo byl zrušen, připoj ho znovu v Nastavení');
    }
    throw new Error(`Google: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data as { access_token: string; expires_in: number; refresh_token?: string };
}

/** Finish a sign-in: returns where to send the browser. */
export async function finishAuth(port: number, code: string, state: string): Promise<string> {
  const p = pending.get(state);
  if (!p) throw new Error('Přihlášení vypršelo, zkus to znovu');
  pending.delete(state);
  const t = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: p.verifier, redirect_uri: redirectUri(port) });
  if (!t.refresh_token) throw new Error('Google nevrátil refresh token; odeber aplikaci v účtu Google a připoj znovu');
  setSecret(TOKEN_NAME, t.refresh_token);
  access = { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
  return p.back;
}

async function accessToken(): Promise<string> {
  if (access && access.until > Date.now()) return access.token;
  const refresh = getSecret(TOKEN_NAME);
  if (!refresh) throw new Error('Gmail není připojený');
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  access = { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
  return access.token;
}

export async function disconnect(): Promise<void> {
  const refresh = getSecret(TOKEN_NAME);
  if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => {});
  deleteSecret(TOKEN_NAME);
  access = undefined;
}

export class GmailError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GmailError(`Gmail ${res.status}: ${err.error?.message ?? res.statusText}`, res.status);
  }
  return (await res.json()) as T;
}

export const profile = () => api<{ emailAddress: string; historyId: string }>('/profile');

export const send = (raw: string, threadId?: string) =>
  api<{ id: string; threadId: string }>('/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });

/** Message ids matching a Gmail search, newest first, up to `max`. */
export async function search(q: string, max = 200): Promise<{ id: string; threadId: string }[]> {
  const out: { id: string; threadId: string }[] = [];
  let page: string | undefined;
  do {
    const params = new URLSearchParams({ q, maxResults: String(Math.min(100, max - out.length)) });
    if (page) params.set('pageToken', page);
    const r = await api<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(`/messages?${params}`);
    out.push(...(r.messages ?? []));
    page = r.nextPageToken;
  } while (page && out.length < max);
  return out;
}

/**
 * Messages added since a history id. Returns null when the id is too old (Gmail keeps about
 * a week), so the caller falls back to a search.
 */
export async function addedSince(historyId: string): Promise<{ messages: { id: string; threadId: string }[]; historyId: string } | null> {
  const messages: { id: string; threadId: string }[] = [];
  let page: string | undefined;
  let latest = historyId;
  try {
    do {
      const params = new URLSearchParams({ startHistoryId: historyId, historyTypes: 'messageAdded', maxResults: '500' });
      if (page) params.set('pageToken', page);
      const r = await api<{ history?: { messagesAdded?: { message: { id: string; threadId: string } }[] }[]; nextPageToken?: string; historyId: string }>(`/history?${params}`);
      for (const h of r.history ?? []) for (const m of h.messagesAdded ?? []) messages.push({ id: m.message.id, threadId: m.message.threadId });
      latest = r.historyId;
      page = r.nextPageToken;
    } while (page);
  } catch (e) {
    if (e instanceof GmailError && e.status === 404) return null;
    throw e;
  }
  return { messages, historyId: latest };
}

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export const message = (id: string) => api<GmailMessage>(`/messages/${id}?format=full`);

export const metadata = (id: string) =>
  api<GmailMessage>(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`);

export async function attachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const r = await api<{ data: string }>(`/messages/${messageId}/attachments/${attachmentId}`);
  return Buffer.from(r.data, 'base64url');
}
