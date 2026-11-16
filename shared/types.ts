/** Types shared by the server and the Vue app. */

export type Source = 'linkedin' | 'jobscz' | 'startupjobs' | 'other';

/**
 * Pipeline, in order: new → interested → applied → talking → interview → offer → accepted.
 * Endings: passed (I don't want it), rejected (they said no), ghosted (no answer), closed (posting gone, set by refresh).
 */
export type Status =
  | 'new'
  | 'interested'
  | 'applied'
  | 'talking'
  | 'interview'
  | 'offer'
  | 'accepted'
  | 'passed'
  | 'rejected'
  | 'ghosted'
  | 'closed';

export const STATUSES: { id: Status; label: string; key: string }[] = [
  { id: 'new', label: 'Nové', key: 'n' },
  { id: 'interested', label: 'Zajímá mě', key: 'i' },
  { id: 'applied', label: 'Odesláno', key: 'a' },
  { id: 'talking', label: 'V jednání', key: 'v' },
  { id: 'interview', label: 'Pohovor', key: 'p' },
  { id: 'offer', label: 'Nabídka', key: 'f' },
  { id: 'accepted', label: 'Přijato', key: '' },
  { id: 'passed', label: 'Nechci', key: 'x' },
  { id: 'rejected', label: 'Zamítli', key: 'z' },
  { id: 'ghosted', label: 'Bez odpovědi', key: 'g' },
  { id: 'closed', label: 'Uzavřeno', key: '' },
];

export interface Listing {
  id: string;
  companyId: string;
  company: string;
  title: string;
  url: string;
  source: Source;
  /** Id of the posting on its source site; used to recognise it on refresh. */
  sourceId: string;
  location: string;
  /** Office / hybrid / remote, as the posting words it. */
  mode: string;
  /** Normalised place bucket used by the filters. */
  place: 'brno' | 'remote' | 'praha' | 'jinde';
  contract: string;
  stack: string;
  tags: string[];
  /** Salary as stated in the posting, or '' when it states none. */
  salaryPosted: string;
  benefits: string;
  /** 1–5 match against the profile. */
  fit: number;
  /** 'claude' = assessed by hand, 'auto' = keyword heuristic on refresh. */
  fitSource: 'claude' | 'auto';
  recommended: boolean;
  strengths: string;
  weaknesses: string;
  /** How the posting mentions Vue, or '' when it does not. */
  vue: string;
  /** Full posting text. */
  text: string;
  firstSeen: string;
  lastChecked: string;
  open: boolean;
  closedAt?: string;
  /** Added by hand (referral, recruiter, careers page). Refresh never re-checks or closes it. */
  manual?: boolean;
}

export type EmailKind = 'recruiting' | 'general' | 'person';

export interface CompanyEmail {
  address: string;
  kind: EmailKind;
  note?: string;
}

export interface SalaryEstimate {
  /** Gross CZK per month. */
  min: number;
  max: number;
  /** Where the range comes from. */
  basis: 'inzerát' | 'Levels.fyi' | 'úřad práce' | 'odhad';
  note?: string;
}

export interface Company {
  id: string;
  name: string;
  size: 'velká' | 'střední' | 'malá' | 'neznámá';
  salary?: SalaryEstimate;
  emails: CompanyEmail[];
}

export type EventKind = 'status' | 'message' | 'interview' | 'note';

/** One entry in the history of an application. */
export interface TrackEvent {
  id: string;
  kind: EventKind;
  /** yyyy-mm-dd. Interviews may be in the future. */
  at: string;
  /** HH:MM, interviews only. */
  time?: string;
  /** For kind 'status': the status moved to. */
  status?: Status;
  /** Who it was with (messages, interviews). */
  contactId?: string;
  text: string;
}

/** A to-do on one application: take-home assignment, send portfolio, prepare questions… */
export interface Task {
  id: string;
  listingId: string;
  title: string;
  /** yyyy-mm-dd, '' = no date. */
  due: string;
  /** ISO time it was ticked off, '' while open. */
  doneAt: string;
  createdAt: string;
}

export type TemplateKind = 'followUp' | 'thankYou' | 'decline';
export interface MailTemplate {
  subject: string;
  body: string;
}

/** A person at a company: recruiter, hiring manager, referrer… */
export interface Contact {
  id: string;
  companyId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  note: string;
  createdAt: string;
}

export interface ListingState {
  status: Status;
  note: string;
  /** yyyy-mm-dd the application was sent, '' when not yet. */
  contactedAt: string;
  /** yyyy-mm-dd of the next thing to do, '' when nothing is planned. */
  nextAt: string;
  /** What that next thing is. */
  nextNote: string;
  /** Follow-ups sent since the last answer from them. */
  followUps: number;
  /** How much I want this one, 1–5; 0 = not rated. */
  rating: number;
  /** My own labels, e.g. "remote", "startup", "dream". */
  labels: string[];
  /** Who referred me, '' when nobody. Counts as source "referral" in the stats. */
  referredBy: string;
  events: TrackEvent[];
  updatedAt: string;
}

export interface RefreshRun {
  at: string;
  added: string[];
  closed: string[];
  reopened: string[];
  changed: string[];
  errors: string[];
}

export interface RefreshProgress {
  running: boolean;
  step: string;
  done: number;
  total: number;
  startedAt?: string;
  error?: string;
}

export interface Settings {
  /** Intro e-mail templates; {company} and {title} are replaced. */
  introCs: { subject: string; body: string };
  introEn: { subject: string; body: string };
  /** Search terms used on refresh. */
  keywords: string[];
  vueKeywords: string[];
  /** Postings whose title matches are skipped on refresh. */
  excludeTitle: string;
  /** Minimum gross monthly salary used by the "under my minimum" hint. */
  minSalary: number;
  /** Days after sending an application (or a follow-up) before the next reminder. */
  followUpDays: number;
  /** Run a refresh by itself once a day while the server is running. */
  autoRefresh: boolean;
  /** Applications I want to send per week. */
  weeklyGoal: number;
  /** Follow-up, thank-you and decline e-mails; {company}, {title} and {name} are replaced. */
  templates: Record<TemplateKind, { cs: MailTemplate; en: MailTemplate }>;
}

export interface Db {
  listings: Listing[];
  companies: Company[];
  contacts: Contact[];
  tasks: Task[];
  state: Record<string, ListingState>;
  runs: RefreshRun[];
  settings: Settings;
}

/** What can be read from a pasted posting URL, to prefill the "add by hand" form. */
export interface Preview {
  source: Source;
  sourceId: string;
  url: string;
  title: string;
  company: string;
  location: string;
  text: string;
}

export interface ManualInput {
  url?: string;
  title: string;
  company: string;
  location?: string;
  place?: Listing['place'];
  mode?: string;
  salaryPosted?: string;
  text?: string;
}
