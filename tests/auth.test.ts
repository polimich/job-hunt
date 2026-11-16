import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { auth, calendarToken, sessionValue, validSession } from '../server/auth';
import { allowedHosts, guard } from '../server/guard';

const PW = 'correct horse';
function app() {
  const a = new Hono();
  a.use('*', guard(5174, allowedHosts(5174, 'jobs.example.com')));
  a.use('*', auth(PW));
  a.get('/api/db', (c) => c.json({ ok: true }));
  a.get('/calendar.ics', (c) => c.text('feed'));
  a.get('/', (c) => c.text('app'));
  return a;
}
const host = { host: 'jobs.example.com' };
const login = (password: string, ip = '1.1.1.1') =>
  app().request('/login', {
    method: 'POST',
    headers: { ...host, origin: 'https://jobs.example.com', 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip },
    body: new URLSearchParams({ password }),
  });

describe('session cookie', () => {
  it('accepts its own signature until it expires, nothing else', () => {
    const v = sessionValue(PW, 1000);
    expect(validSession(PW, v, 2000)).toBe(true);
    expect(validSession('other', v, 2000)).toBe(false);
    expect(validSession(PW, v, 1000 + 31 * 86_400_000)).toBe(false);
    expect(validSession(PW, v.replace(/.$/, 'x'), 2000)).toBe(false);
  });
});

describe('login', () => {
  it('sends a visitor without a session to the login page, and the API answers 401', async () => {
    expect((await app().request('/', { headers: host })).headers.get('location')).toBe('/login');
    expect((await app().request('/api/db', { headers: host })).status).toBe(401);
  });
  it('lets the right password in with a cookie', async () => {
    const res = await login(PW);
    expect(res.status).toBe(303);
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
    expect((await app().request('/api/db', { headers: { ...host, cookie } })).status).toBe(200);
  });
  it('locks out after repeated wrong passwords', async () => {
    for (let i = 0; i < 5; i++) expect((await login('nope', '2.2.2.2')).status).toBe(401);
    expect((await login(PW, '2.2.2.2')).status).toBe(429);
  });
  it('serves the calendar feed with its token only', async () => {
    expect((await app().request('/calendar.ics', { headers: host })).status).toBe(401);
    expect((await app().request(`/calendar.ics?token=${calendarToken(PW)}`, { headers: host })).status).toBe(200);
  });
  it('still refuses other hosts', async () => {
    expect((await app().request('/login', { headers: { host: 'evil.example' } })).status).toBe(403);
  });
});
