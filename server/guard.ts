/**
 * The API listens on 127.0.0.1 only, but any web page open in the browser can still send
 * requests to it. Since the app can send e-mail as its owner, every request must come from
 * the app itself: a known Host (stops DNS rebinding), no foreign Origin, and JSON or
 * multipart bodies only (a cross-site form can only send text/plain or urlencoded).
 */
import type { MiddlewareHandler } from 'hono';

/** Local addresses, plus the public domain of a hosted copy (PUBLIC_HOST, e.g. jobs.example.com). */
export function allowedHosts(port: number, publicHost = process.env.PUBLIC_HOST): Set<string> {
  const local = ['localhost', '127.0.0.1'].flatMap((h) => [`${h}:${port}`, `${h}:5173`]);
  return new Set([...local, ...(publicHost ? publicHost.split(',').map((h) => h.trim()).filter(Boolean) : [])]);
}

export function guard(port: number, hosts = allowedHosts(port)): MiddlewareHandler {
  return async (c, next) => {
    if (!hosts.has(c.req.header('host') ?? '')) return c.json({ error: 'forbidden host' }, 403);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin && !hosts.has(origin.replace(/^https?:\/\//, ''))) return c.json({ error: 'forbidden origin' }, 403);
      if (c.req.header('sec-fetch-site') === 'cross-site') return c.json({ error: 'forbidden origin' }, 403);
      const type = c.req.header('content-type') ?? '';
      const empty = !c.req.header('content-length') || c.req.header('content-length') === '0';
      // The login form is a plain HTML form; its origin is still checked above.
      const form = c.req.path === '/login' || c.req.path === '/logout';
      if (!empty && !form && !type.startsWith('application/json') && !type.startsWith('multipart/form-data')) {
        return c.json({ error: 'unsupported content type' }, 415);
      }
    }
    await next();
  };
}
