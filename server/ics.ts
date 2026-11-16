/**
 * iCalendar (RFC 5545) feed: interviews with their time, plus next steps and tasks as all-day items.
 * Times are "floating" local times, which calendar apps show in the viewer's own zone (Prague here).
 */
import { addDays } from '../shared/pipeline.ts';
import { INTERVIEW_ROUNDS, type Db, type Listing, type TrackEvent } from '../shared/types.ts';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const day = (iso: string) => iso.replaceAll('-', '');
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Lines longer than 75 octets are folded, as the RFC asks. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

interface Item {
  uid: string;
  summary: string;
  description?: string;
  url?: string;
  date: string;
  time?: string;
  minutes?: number;
}

function vevent(i: Item): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${i.uid}@job-hunt.local`, `DTSTAMP:${stamp()}`];
  if (i.time) {
    const [h, m] = i.time.split(':').map(Number);
    const start = `${day(i.date)}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
    const endMin = h! * 60 + m! + (i.minutes ?? 60);
    const end = `${day(i.date)}T${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}${String(endMin % 60).padStart(2, '0')}00`;
    lines.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${day(i.date)}`, `DTEND;VALUE=DATE:${day(addDays(i.date, 1))}`);
  }
  lines.push(`SUMMARY:${esc(i.summary)}`);
  if (i.description) lines.push(`DESCRIPTION:${esc(i.description)}`);
  if (i.url) lines.push(`URL:${esc(i.url)}`);
  if (i.time) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(i.summary)}`, 'TRIGGER:-PT30M', 'END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}

export function interviewItem(l: Listing, e: TrackEvent, who?: string): Item {
  const round = INTERVIEW_ROUNDS.find((r) => r.id === e.round)?.label;
  return {
    uid: `interview-${e.id}`,
    summary: `Pohovor: ${l.company}${round ? ` (${round})` : ''}`,
    description: [l.title, e.text, who ? `S: ${who}` : '', l.url].filter(Boolean).join('\n'),
    url: l.url || undefined,
    date: e.at,
    time: e.time,
  };
}

export function calendar(items: Item[], name = 'Job hunt'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//job-hunt//CZ', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`, ...items.flatMap(vevent), 'END:VCALENDAR'];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Everything worth a calendar entry: interviews, next steps and dated tasks of open applications. */
export function feed(data: Db): string {
  const byId = new Map(data.listings.map((l) => [l.id, l]));
  const contact = new Map(data.contacts.map((c) => [c.id, c.name]));
  const items: Item[] = [];
  for (const [id, st] of Object.entries(data.state)) {
    const l = byId.get(id);
    if (!l) continue;
    for (const e of st.events) if (e.kind === 'interview') items.push(interviewItem(l, e, e.contactId ? contact.get(e.contactId) : undefined));
    if (st.nextAt) items.push({ uid: `next-${id}`, summary: `↻ ${l.company}: ${st.nextNote || 'Ozvat se'}`, description: l.title, url: l.url || undefined, date: st.nextAt });
  }
  for (const t of data.tasks) {
    const l = byId.get(t.listingId);
    if (l && t.due && !t.doneAt) items.push({ uid: `task-${t.id}`, summary: `☐ ${l.company}: ${t.title}`, description: l.title, date: t.due });
  }
  return calendar(items);
}
