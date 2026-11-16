/**
 * Single-user login for a hosted copy. Off unless APP_PASSWORD is set, so local `pnpm dev`
 * needs no login. A successful login sets an HttpOnly cookie signed with a key derived from
 * the password (changing the password signs everyone out). The calendar feed has its own
 * token in the URL, because calendar apps cannot log in.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const COOKIE = 'jh_session';
const DAYS = 30;
const MAX_FAILS = 5;
/** Across all clients, since a forwarded IP can be faked. */
const MAX_FAILS_ALL = 30;
const LOCK_MS = 15 * 60_000;

const hmac = (key: string, data: string) => createHmac('sha256', key).update(data).digest('base64url');

function same(a: string, b: string): boolean {
  const x = Buffer.from(hmac('cmp', a));
  const y = Buffer.from(hmac('cmp', b));
  return timingSafeEqual(x, y);
}

export function sessionValue(password: string, now = Date.now()): string {
  const exp = String(now + DAYS * 86_400_000);
  return `${exp}.${hmac(`session:${password}`, exp)}`;
}

export function validSession(password: string, value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || Number(exp) < now) return false;
  return same(sig, hmac(`session:${password}`, exp));
}

/** The secret part of the calendar feed URL. */
export const calendarToken = (password: string): string => hmac(`calendar:${password}`, 'feed').slice(0, 32);

/** Failed attempts per client, so the password cannot be guessed by brute force. */
const fails = new Map<string, { n: number; until: number }>();
const clientOf = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';

export function locked(client: string, now = Date.now()): boolean {
  const over = (key: string, max: number) => {
    const f = fails.get(key);
    return !!f && f.n >= max && f.until > now;
  };
  return over(client, MAX_FAILS) || over('*', MAX_FAILS_ALL);
}
function failed(client: string, now = Date.now()): void {
  for (const key of [client, '*']) {
    const f = fails.get(key);
    fails.set(key, { n: f && f.until > now ? f.n + 1 : 1, until: now + LOCK_MS });
  }
}

const page = (error = '') => `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Přihlášení · Job hunt</title>
<style>
:root{color-scheme:light dark;--bg:#faf7f2;--fg:#1f1d1a;--muted:#6b665e;--card:#fff;--line:#e6e0d6;--accent:#1f1d1a;--accent-fg:#fff;--err:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#17161a;--fg:#f2efe9;--muted:#a39e96;--card:#211f24;--line:#36333a;--accent:#f2efe9;--accent-fg:#17161a;--err:#f97066}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;padding:16px}
form{width:100%;max-width:340px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
h1{margin:0 0 4px;font-size:22px}p{margin:0 0 20px;color:var(--muted);font-size:14px}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit}
button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:var(--accent);color:var(--accent-fg);font:inherit;font-weight:600;cursor:pointer}
.err{color:var(--err);font-size:14px;margin:10px 0 0}
</style></head><body>
<form method="post" action="/login">
<h1>Job hunt</h1><p>Zadej heslo.</p>
<input type="password" name="password" autocomplete="current-password" autofocus required aria-label="Heslo">
${error ? `<div class="err" role="alert">${error}</div>` : ''}
<button type="submit">Přihlásit</button>
</form></body></html>`;

// A hosted copy (PUBLIC_HOST) is served over HTTPS by the proxy in front of it.
const secure = (c: Context) => !!process.env.PUBLIC_HOST || (c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '')) === 'https';

/** Routes and middleware; mount before everything else. */
export function auth(password: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!password) return next();
    const path = c.req.path;
    if (path === '/healthz') return c.text('ok');

    if (path === '/login' && c.req.method === 'GET') return c.html(page());
    if (path === '/login' && c.req.method === 'POST') {
      const client = clientOf(c);
      if (locked(client)) return c.html(page('Příliš mnoho pokusů. Zkus to za 15 minut.'), 429);
      const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      const given = typeof body.password === 'string' ? body.password : '';
      if (!same(given, password)) {
        failed(client);
        return c.html(page('Špatné heslo.'), 401);
      }
      fails.delete(client);
      setCookie(c, COOKIE, sessionValue(password), { httpOnly: true, secure: secure(c), sameSite: 'Lax', path: '/', maxAge: DAYS * 86_400 });
      return c.redirect('/', 303);
    }
    if (path === '/logout' && c.req.method === 'POST') {
      deleteCookie(c, COOKIE, { path: '/' });
      return c.redirect('/login', 303);
    }
    if (path === '/calendar.ics' && c.req.query('token') && same(c.req.query('token')!, calendarToken(password))) return next();

    if (validSession(password, getCookie(c, COOKIE))) return next();
    if (path.startsWith('/api/') || path.endsWith('.ics')) return c.json({ error: 'nepřihlášen' }, 401);
    return c.redirect('/login', 302);
  };
}
