/**
 * Recognising a pasted e-mail: rejection, interview invitation, offer, confirmation or a
 * plain reply, and the status that goes with it. Rules only, Czech and English.
 */
import { fold } from './search.ts';
import type { MailClass, Status } from './types.ts';

const CLOSED: Status[] = ['accepted', 'passed', 'rejected', 'ghosted', 'closed'];

// ---------- classification ----------

const any = (text: string, phrases: string[]) => phrases.some((p) => text.includes(p));

const REJECTION = [
  'bohuzel', 'jineho kandidata', 'jine kandidaty', 'nebudeme pokracovat', 'nepostoupil', 'pozice byla obsazena', 'rozhodli jsme se pokracovat s',
  'unfortunately', 'not moving forward', 'not to move forward', 'move forward with other', 'other candidates', 'won\'t be moving forward',
  'will not be moving forward', 'position has been filled', 'regret to inform', 'not be progressing', 'not been selected', 'decided not to proceed',
];
const OFFER = ['job offer', 'offer letter', 'pleased to offer', 'happy to offer', 'excited to offer', 'nabidku prace', 'pracovni nabidku vam', 'radi bychom vam nabidli', 'smlouvu k podpisu'];
const INVITE = [
  'calendly.com', 'meet.google.com', 'teams.microsoft.com', 'zoom.us/j', 'cal.com/', 'invite you to', 'invite you for', 'like to schedule',
  'schedule a call', 'schedule an interview', 'book a time', 'pick a time', 'availability for', 'pozvat na pohovor', 'pozvanka na pohovor',
  'pozvat vas', 'domluvit termin', 'domluvit si termin', 'termin pohovoru', 'kdy by se vam hodilo', 'osobni schuzk', 'videohovor',
];
const RECEIPT = [
  'thank you for applying', 'thanks for applying', 'thank you for your application', 'received your application', 'your application was sent',
  'application has been received', 'application has been submitted', 'dekujeme za vas zajem', 'dekujeme za vasi prihlasku', 'dekujeme za zaslani',
  'potvrzujeme prijeti', 'obdrzeli jsme vas', 'odpoved na inzerat', 'vase zadost byla odeslana', 'vase prihlaska byla odeslana', 'zivotopis jsme obdrzeli',
];
const ASSIGNMENT = ['home assignment', 'take-home', 'take home', 'technical task', 'coding challenge', 'test assignment', 'technical assignment', 'ukol na doma', 'testovaci ukol', 'zadani ukolu'];

/** The order matters: a rejection often says "thank you for applying" too. */
export function classify(raw: string): MailClass {
  const text = fold(raw.slice(0, 8000));
  if (any(text, REJECTION)) return 'rejection';
  if (any(text, OFFER)) return 'offer';
  if (text.includes('begin:vcalendar') || any(text, INVITE)) return 'invite';
  if (any(text, RECEIPT)) return 'receipt';
  if (any(text, ASSIGNMENT)) return 'assignment';
  return 'reply';
}

/** The status an e-mail suggests for the listing it belongs to, or null. */
export function suggestedStatus(cls: MailClass, current: Status): Status | null {
  if (CLOSED.includes(current) && cls !== 'offer') return null;
  if (cls === 'receipt') return current === 'new' || current === 'interested' ? 'applied' : null;
  if (cls === 'rejection') return 'rejected';
  if (cls === 'offer') return current === 'offer' ? null : 'offer';
  if (cls === 'invite') return current === 'interview' || current === 'offer' ? null : 'interview';
  if ((cls === 'reply' || cls === 'assignment') && (current === 'applied' || current === 'interested' || current === 'new')) return 'talking';
  return null;
}
