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

/** AI summary of a posting (Czech), made with Claude on the owner's subscription. */
export interface ListingSummary {
  oneLine: string;
  company: string;
  role: string;
  mustHave: string[];
  niceToHave: string[];
  stack: string[];
  salary: string;
  benefits: string[];
  workMode: string;
  languages: string;
  contract: string;
  hiring: string;
  companyType: string;
  fit: { matches: string[]; missing: string[]; seniority: string };
  redFlags: string[];
  questions: string[];
  /** Up to 3 reasons for and against, judged against my wishes and profile. */
  pros: string[];
  cons: string[];
  /** 0–100: how well the posting fits my wishes and profile. */
  match: number;
  /** Of the wishes and profile it was judged against; '' in summaries from before the deck. */
  profile: string;
  /** Of the inputs it was made from; a different hash means it is out of date. */
  hash: string;
  model: string;
  createdAt: string;
}

/** What the AI found about a company on the web; one per company, shared by its postings. */
export interface CompanyResearch {
  what: string;
  product: string;
  /** Stack, how they work, engineering blog, open source. */
  engineering: string[];
  news: string[];
  /** Who hires there, as publicly listed: recruiter, team lead, CTO. */
  people: { name: string; role: string; url: string }[];
  hiring: string;
  /** Concrete things an application can refer to. */
  hooks: string[];
  sources: string[];
  model: string;
  createdAt: string;
}

/** A CV put together for one posting from my profile and the (edited) advice in the kit. */
export interface TailoredCv {
  lang: 'cs' | 'en';
  name: string;
  headline: string;
  contact: string[];
  links: string[];
  summary: string;
  experience: { role: string; company: string; period: string; bullets: string[] }[];
  projects: { name: string; url: string; text: string }[];
  skills: { label: string; items: string[] }[];
  education: { school: string; degree: string; period: string }[];
  languages: string[];
  createdAt: string;
}

export const KIT_STEPS = ['company', 'cv', 'message', 'sent'] as const;
export type KitStep = (typeof KIT_STEPS)[number];

/** Everything prepared for applying to one posting: drafts to rewrite in my own voice, and advice. */
export interface ApplicationKit {
  /** Language of the texts that get sent; the posting's language. */
  lang: 'cs' | 'en';
  email: { subject: string; body: string };
  /** Answers for application forms. */
  form: { message: string; whyUs: string; aboutMe: string; salary: string; start: string };
  linkedin: string;
  cv: { summary: string; moveUp: string[]; keywordsHave: string[]; keywordsMissing: string[] };
  /** Preparation for the first call. */
  call: { theyAsk: string[]; know: string[]; myQuestions: string[] };
  /** Facts the drafts needed and my profile does not have. */
  gaps: string[];
  /** Steps of the procedure I ticked off. */
  done: KitStep[];
  cvDoc?: TailoredCv;
  model: string;
  createdAt: string;
}

export const CHAT_MODES = ['free', 'mock', 'stack', 'review'] as const;
/** What the interview-prep chat is doing: free talk, mock interview, their stack, my knowledge. */
export type ChatMode = (typeof CHAT_MODES)[number];
export type ChatModel = 'sonnet' | 'opus';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** The mode I was in when I sent it. */
  mode?: ChatMode;
  /** Which model answered. */
  model?: ChatModel;
  at: string;
  /** I stopped the answer; the text is what had arrived. */
  stopped?: boolean;
  /** Why there is no answer. */
  error?: string;
}

/** The cheat sheet for one interview, built up from the chat. */
export interface PrepSheet {
  /** Questions I expect, with my best answer. */
  answers: { q: string; a: string }[];
  weak: string[];
  /** What to remember about their stack. */
  stack: string[];
  /** Questions for them. */
  ask: string[];
  updatedAt: string;
}

/** Interview preparation for one posting: one conversation and its cheat sheet. */
export interface PrepChat {
  messages: ChatMessage[];
  sheet: PrepSheet;
  /** Language of the mock interview; the posting's unless I switch. */
  lang: 'cs' | 'en';
}

/** What the page gets about a chat: the stored part, and what is being made right now. */
export interface PrepState {
  chat: PrepChat;
  /** The answer being written. */
  running: { text: string; model: ChatModel } | null;
  sheetBusy: boolean;
  sheetError?: string;
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
  /** Why I passed on it (a PASS_REASONS id), '' when not said. */
  passReason: string;
  /** When I put it off in the sorting deck ("later"), '' otherwise. Later cards come last. */
  deferredAt: string;
  events: TrackEvent[];
  updatedAt: string;
}

/** One-tap reasons for passing on a posting in the sorting deck. */
export const PASS_REASONS: { id: string; label: string }[] = [
  { id: 'pay', label: 'Mzda' },
  { id: 'stack', label: 'Stack' },
  { id: 'place', label: 'Místo' },
  { id: 'level', label: 'Úroveň' },
  { id: 'company', label: 'Firma' },
  { id: 'role', label: 'Náplň' },
];

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
  /** What I want from a job, in my own words. The AI judges pros, cons and match against it. */
  wishes: string;
  /** Summarize new postings with Claude (the owner's subscription, via Claude Code). */
  aiSummaries: boolean;
  /** Facts about me (experience, projects, numbers, contact); the only source for application drafts. */
  profile: string;
  /** When I can start, in my words; goes into every draft. */
  startDate: string;
  /** Salary I ask for; used only where the posting or a form asks. */
  salaryAsk: string;
  /** Prepare an application kit for every shortlisted posting (Claude with web search). */
  aiKits: boolean;
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
  /** AI summaries by listing id. */
  summaries: Record<string, ListingSummary>;
  /** Hash of the wishes and profile right now; a summary with another `profile` is out of date. */
  summaryProfile: string;
  /** Application kits by listing id, and why the last attempt failed. */
  kits: Record<string, ApplicationKit>;
  kitErrors: Record<string, string>;
  /** Web research by company id. */
  research: Record<string, CompanyResearch>;
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

// ---------- e-mail ----------

/** What a received e-mail is, as far as the job hunt is concerned. */
export type MailClass = 'receipt' | 'rejection' | 'invite' | 'offer' | 'assignment' | 'reply';

/** Which template an e-mail started from; decides what is logged when it is opened. */
export type EmailTemplateKind = 'intro' | 'followUp' | 'thankYou' | 'decline' | 'other';
