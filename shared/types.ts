/** Types shared by the server and the Vue app. */

export type Source = 'linkedin' | 'jobscz' | 'startupjobs' | 'mpsv' | 'careerjet' | 'jooble' | 'other';

export const SOURCE_LABELS: Record<Source | 'referral', string> = {
  linkedin: 'LinkedIn',
  jobscz: 'jobs.cz',
  startupjobs: 'StartupJobs',
  mpsv: 'Úřad práce',
  careerjet: 'Careerjet',
  jooble: 'Jooble',
  other: 'Jiné / ručně',
  referral: 'Doporučení',
};

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
  /** In the search town (or anywhere in Czechia when none is set), remote, or elsewhere. */
  place: 'local' | 'remote' | 'jinde';
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
  /** Legacy: how postings from before v0.8 mention Vue. No longer filled or shown. */
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
  /** Interviews only: what kind of round. */
  round?: InterviewRound;
  text: string;
}

export type InterviewRound = 'hr' | 'tech' | 'homework' | 'team' | 'final' | 'other';
export const INTERVIEW_ROUNDS: { id: InterviewRound; label: string }[] = [
  { id: 'hr', label: 'HR / úvodní' },
  { id: 'tech', label: 'Technické' },
  { id: 'homework', label: 'Úkol na doma' },
  { id: 'team', label: 'S týmem' },
  { id: 'final', label: 'Finální' },
  { id: 'other', label: 'Jiné' },
];

/** What an offer actually says, for comparing them side by side. */
export interface Offer {
  /** Gross CZK per month; 0 = not known yet. */
  salary: number;
  bonus: string;
  /** Home-office days a week, e.g. "2", "full remote". */
  remote: string;
  /** Days of holiday a year; 0 = not known. */
  vacation: number;
  /** HPP, IČO… */
  contract: string;
  /** yyyy-mm-dd I can start, '' unknown. */
  start: string;
  /** yyyy-mm-dd I must answer by, '' none. */
  deadline: string;
  note: string;
}

/** A file I send with applications: a CV version, a cover letter, a portfolio. */
export interface Doc {
  id: string;
  /** What I call it, e.g. "CV EN – frontend". */
  label: string;
  kind: 'cv' | 'cover' | 'other';
  /** Original file name. */
  fileName: string;
  size: number;
  createdAt: string;
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
  /** Documents sent with this application (Doc ids). */
  docIds: string[];
  /** The offer, once there is one. */
  offer?: Offer;
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

export type Level = 'any' | 'junior' | 'medior' | 'senior' | 'lead';

export interface Settings {
  /** Intro e-mail templates; {company} and {title} are replaced. */
  introCs: { subject: string; body: string };
  introEn: { subject: string; body: string };
  /** Search terms; each one is searched on every portal that has a search. */
  keywords: string[];
  /** Town to search in; '' = the whole of Czechia. */
  location: string;
  /** Distance around the town in km (jobs.cz, LinkedIn); 0 = the town only. */
  radiusKm: number;
  /** Also look for fully remote jobs anywhere in Czechia. */
  remote: boolean;
  /** Only postings from the last N days (LinkedIn); 0 = any age. */
  postedWithinDays: number;
  /** A new posting's title must contain one of these; empty = trust each portal's search. */
  titleMustMatch: string[];
  /** New postings whose title contains one of these are skipped. */
  excludeWords: string[];
  /** Úřad práce: CZ-ISCO groups taken whole, besides postings that mention a keyword. */
  mpsvCategories: string[];
  /** Seniority I'm after; the automatic match score prefers it. */
  level: Level;
  /** Minimum gross monthly salary used by the "under my minimum" hint. */
  minSalary: number;
  /** Days after sending an application (or a follow-up) before the next reminder. */
  followUpDays: number;
  /** Run a refresh by itself once a day while the server is running. */
  autoRefresh: boolean;
  /** Applications I want to send per week. */
  weeklyGoal: number;
  /** My skills, matched against each posting's stack. */
  skills: string[];
  /** Which sources search on refresh; missing = on. */
  sources: Partial<Record<Source, boolean>>;
  /** Follow-up, thank-you and decline e-mails; {company}, {title} and {name} are replaced. */
  templates: Record<TemplateKind, { cs: MailTemplate; en: MailTemplate }>;
}

export interface Db {
  listings: Listing[];
  companies: Company[];
  contacts: Contact[];
  tasks: Task[];
  docs: Doc[];
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
