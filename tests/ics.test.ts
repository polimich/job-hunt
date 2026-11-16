import { describe, expect, it } from 'vitest';
import { emptyState, withEvent, withStatus } from '../shared/pipeline';
import type { Db, Listing } from '../shared/types';
import { calendar, feed } from '../server/ics';

const l = { id: 'a', company: 'Acme, s.r.o.', title: 'Frontend; Vue', url: 'https://x', companyId: 'acme' } as Listing;
const S = { followUpDays: 7 };

describe('iCalendar', () => {
  it('writes timed interviews with an alarm and escapes text', () => {
    const ics = calendar([{ uid: 'u1', summary: 'Pohovor: Acme, s.r.o.', date: '2026-11-20', time: '09:30', minutes: 45 }]);
    expect(ics).toContain('DTSTART:20261120T093000');
    expect(ics).toContain('DTEND:20261120T101500');
    expect(ics).toContain('SUMMARY:Pohovor: Acme\\, s.r.o.');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('folds long lines at 75 octets', () => {
    const ics = calendar([{ uid: 'u', summary: 'ž'.repeat(80), date: '2026-11-20' }]);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('feeds interviews, next steps and open dated tasks', () => {
    let st = withStatus(emptyState(), 'applied', '2026-11-16', S);
    st = withEvent(st, { kind: 'interview', at: '2026-11-20', time: '10:00', round: 'tech', text: 'CTO' }, '2026-11-16', S);
    const data = {
      listings: [l], companies: [], contacts: [], docs: [], runs: [], settings: {} as Db['settings'],
      state: { a: st },
      tasks: [
        { id: 't1', listingId: 'a', title: 'Úkol', due: '2026-11-19', doneAt: '', createdAt: '' },
        { id: 't2', listingId: 'a', title: 'Hotovo', due: '2026-11-19', doneAt: 'x', createdAt: '' },
      ],
    } satisfies Db;
    const ics = feed(data);
    expect(ics).toContain('SUMMARY:Pohovor: Acme\\, s.r.o. (Technické)');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261121'); // thank-you next step
    expect(ics).toContain('☐ Acme\\, s.r.o.: Úkol');
    expect(ics).not.toContain('Hotovo');
  });
});
