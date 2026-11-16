import { describe, expect, it } from 'vitest';
import { addDays, emptyState, followedUp, furthestRank, looksGhosted, normalizeState, RANK, withEvent, withStatus } from '../shared/pipeline';
import type { Listing } from '../shared/types';
import { parseTitle } from '../server/manual';
import { refreshDue } from '../server/snapshot';
import { computeStats, mondayOf } from '../src/stats';

const S = { followUpDays: 7 };
const DAY = '2026-11-16';

describe('normalizeState', () => {
  it('maps the old statuses of records written before the history existed', () => {
    expect(normalizeState({ status: 'contacted', note: 'x', contactedAt: '2026-11-10', updatedAt: '' }).status).toBe('applied');
    expect(normalizeState({ status: 'rejected', note: '', contactedAt: '', updatedAt: '' }).status).toBe('passed');
  });
  it('leaves current records alone, so a new "rejected" stays rejected', () => {
    const st = normalizeState({ ...emptyState(), status: 'rejected' });
    expect(st.status).toBe('rejected');
  });
  it('fills in missing fields', () => {
    expect(normalizeState({ status: 'interested' })).toMatchObject({ nextAt: '', followUps: 0, events: [] });
  });
});

describe('withStatus', () => {
  it('stamps the send date and plans a follow-up when an application goes out', () => {
    const st = withStatus(emptyState(), 'applied', DAY, S);
    expect(st.contactedAt).toBe(DAY);
    expect(st.nextAt).toBe(addDays(DAY, 7));
    expect(st.events.map((e) => e.status)).toEqual(['applied']);
  });
  it('keeps an existing send date and clears the plan on an ending', () => {
    const sent = withStatus(emptyState(), 'applied', '2026-11-01', S);
    const no = withStatus(sent, 'rejected', DAY, S);
    expect(no.contactedAt).toBe('2026-11-01');
    expect(no.nextAt).toBe('');
  });
  it('does nothing when the status is the same', () => {
    const st = withStatus(emptyState(), 'interested', DAY, S);
    expect(withStatus(st, 'interested', DAY, S)).toBe(st);
  });
  it('starts the follow-up count over once they answer', () => {
    const st = followedUp(withStatus(emptyState(), 'applied', DAY, S), DAY, S);
    expect(withStatus(st, 'talking', DAY, S).followUps).toBe(0);
  });
});

describe('follow-ups', () => {
  it('suggests ghosted after two unanswered follow-ups', () => {
    let st = withStatus(emptyState(), 'applied', DAY, S);
    st = followedUp(st, DAY, S);
    expect(looksGhosted(st)).toBe(false);
    st = followedUp(st, addDays(DAY, 7), S);
    expect(looksGhosted(st)).toBe(true);
    expect(st.nextAt).toBe(addDays(DAY, 14));
  });
});

describe('withEvent', () => {
  it('moves to interview and plans a thank-you the day after', () => {
    const sent = withStatus(emptyState(), 'applied', DAY, S);
    const st = withEvent(sent, { kind: 'interview', at: '2026-11-20', time: '10:00', text: '1. kolo' }, DAY, S);
    expect(st.status).toBe('interview');
    expect(st.nextAt).toBe('2026-11-21');
    expect(furthestRank(st)).toBe(RANK.interview);
  });
  it('does not reopen an application that has ended', () => {
    const st = withEvent({ ...emptyState(), status: 'rejected' }, { kind: 'interview', at: DAY, text: '' }, DAY, S);
    expect(st.status).toBe('rejected');
  });
});

describe('computeStats', () => {
  const listing = (id: string, source: Listing['source']) => ({ id, source }) as Listing;
  it('counts the furthest step reached and the answer rate', () => {
    const a = withStatus(withStatus(emptyState(), 'applied', '2026-11-10', S), 'rejected', DAY, S);
    const b = withStatus(withStatus(emptyState(), 'applied', '2026-11-16', S), 'interview', DAY, S);
    const c = withStatus(emptyState(), 'applied', DAY, S);
    const stats = computeStats([listing('a', 'linkedin'), listing('b', 'jobscz'), listing('c', 'linkedin')], { a, b, c }, DAY, 2);
    expect(stats).toMatchObject({ applied: 3, answered: 2, interviews: 1, rejected: 1, pending: 1 });
    expect(stats.weeks).toEqual([{ start: '2026-11-09', n: 1 }, { start: '2026-11-16', n: 2 }]);
    expect(stats.bySource[0]).toEqual({ source: 'linkedin', applied: 2, answered: 1 });
  });
  it('finds Monday', () => {
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
  });
});

describe('parseTitle', () => {
  it('reads company, title and place from a LinkedIn page title', () => {
    expect(parseTitle('Acme hiring Frontend Developer in Brno, South Moravia, Czechia | LinkedIn', 'LinkedIn')).toEqual({
      company: 'Acme', title: 'Frontend Developer', location: 'Brno, South Moravia, Czechia',
    });
  });
  it('reads the Czech LinkedIn title and ignores board names', () => {
    expect(parseTitle('Fullstack Developer ve společnosti Kontent.ai – Brno', 'Pracovní příležitosti LinkedIn')).toEqual({
      title: 'Fullstack Developer', company: 'Kontent.ai', location: 'Brno',
    });
    expect(parseTitle('Senior Developer', 'StartupJobs.cz').company).toBe('');
  });
  it('reads "Company | Title" on jobs.cz', () => {
    expect(parseTitle('KBC | Full Stack Developer - Vacancy detail', 'Vacancy detail', 'jobscz')).toEqual({ company: 'KBC', title: 'Full Stack Developer', location: '' });
  });
  it('splits "Title | Company"', () => {
    expect(parseTitle('Vue Developer | Kiwi.com', '')).toMatchObject({ title: 'Vue Developer', company: 'Kiwi.com' });
  });
});

describe('refreshDue', () => {
  const at = (h: number) => new Date(2026, 10, 16, h);
  it('runs once a day in waking hours', () => {
    expect(refreshDue(undefined, at(9))).toBe(true);
    expect(refreshDue(undefined, at(3))).toBe(false);
    expect(refreshDue(new Date(2026, 10, 16, 8).toISOString(), at(12))).toBe(false);
    expect(refreshDue(new Date(2026, 10, 15, 8).toISOString(), at(12))).toBe(true);
  });
});
