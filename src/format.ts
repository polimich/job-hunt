import type { Company, Listing, SalaryEstimate } from '../shared/types';

export const thousands = (n: number) => `${Math.round(n / 1000)}`;

export function salaryRange(s: SalaryEstimate | undefined): string {
  return s ? `${thousands(s.min)}–${thousands(s.max)} tis. Kč` : 'bez odhadu';
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const PLACE_LABEL: Record<Listing['place'], string> = { brno: 'Brno', remote: 'Remote', praha: 'Praha', jinde: 'Jinde' };

export const EMAIL_KIND_LABEL = { recruiting: 'náborový', general: 'obecný', person: 'osoba' } as const;

/** Best address to write to: recruiting first, then a named person, then the general inbox. */
export function bestEmail(company: Company | undefined) {
  if (!company) return undefined;
  const order = ['recruiting', 'person', 'general'] as const;
  return [...company.emails].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
}

/** Czech postings get the Czech intro; anything else gets English. */
export function looksCzech(text: string): boolean {
  const sample = text.slice(0, 3000);
  const marks = sample.match(/[ěščřžýáíéůúťďň]/gi)?.length ?? 0;
  return marks > sample.length * 0.015;
}

/** A mailto: link with {title}, {company} and {name} (first name of the person, with a leading space) filled in. */
export function mailto(address: string, subject: string, body: string, listing: Listing, name = ''): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  const fill = (t: string) =>
    t.replaceAll('{title}', listing.title).replaceAll('{company}', listing.company).replaceAll('{name}', first ? ` ${first}` : '');
  return `mailto:${address}?subject=${encodeURIComponent(fill(subject))}&body=${encodeURIComponent(fill(body))}`;
}

/** Czech day count: 1 den, 2–4 dny, 5+ dní. */
export const days = (n: number) => `${n} ${n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'}`;

/** How far a due date is, from the number of days until it (negative = overdue). */
export function dueLabel(d: number): string {
  if (d === 0) return 'dnes';
  if (d === 1) return 'zítra';
  if (d === -1) return 'včera';
  return d < 0 ? `${days(-d)} po termínu` : `za ${days(d)}`;
}

/** Short weekday + date, e.g. "po 17. 11." */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
}
