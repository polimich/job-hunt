/** Exports for backup and spreadsheets: the whole database as JSON, applications as CSV. */
import type { Db } from '../shared/types.ts';

const CSV_COLUMNS = [
  'company', 'title', 'status', 'sent', 'next_step', 'next_note', 'follow_ups', 'fit', 'place', 'source', 'url', 'salary_posted', 'note', 'first_seen', 'open',
] as const;

/** RFC 4180 quoting; a leading = + - @ is prefixed with ' so spreadsheets do not run it as a formula. */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(data: Db): string {
  const rows = data.listings.map((l) => {
    const st = data.state[l.id];
    return [
      l.company, l.title, st?.status ?? 'new', st?.contactedAt ?? '', st?.nextAt ?? '', st?.nextNote ?? '', st?.followUps ?? 0, l.fit,
      l.place, l.source, l.url, l.salaryPosted, st?.note ?? '', l.firstSeen, l.open ? 'ano' : 'ne',
    ].map(csvCell).join(',');
  });
  // BOM so Excel opens the Czech characters correctly.
  return `﻿${[CSV_COLUMNS.join(','), ...rows].join('\r\n')}\r\n`;
}
