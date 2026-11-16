import { describe, expect, it } from 'vitest';
import { classify, suggestedStatus } from '../shared/mail';

describe('classifying mail', () => {
  const c = (subject: string, body = '', _from = '', calendar = '') => classify(`${subject}\n${body}\n${calendar}`);
  it('tells rejection, invite, receipt, offer and replies apart', () => {
    expect(c('Vaše přihláška', 'Děkujeme za Váš zájem, bohužel jsme se rozhodli pro jiného kandidáta.')).toBe('rejection');
    expect(c('Thank you for applying', 'Unfortunately we will not be moving forward.')).toBe('rejection');
    expect(c('Thank you for applying to Acme', 'We have received your application.', 'no-reply@greenhouse.io')).toBe('receipt');
    expect(c('Vaše žádost byla odeslána společnosti Deel', '', 'jobs-noreply@linkedin.com')).toBe('receipt');
    expect(c('Pozvánka na pohovor', 'Kdy by se vám hodilo?')).toBe('invite');
    expect(c('Next steps', 'Pick a time here: https://calendly.com/acme/30min')).toBe('invite');
    expect(c('Invitation', '', 'cal@acme.cz', 'BEGIN:VCALENDAR')).toBe('invite');
    expect(c('Offer', 'We are pleased to offer you the position')).toBe('offer');
    expect(c('Úkol', 'Posíláme testovací úkol')).toBe('assignment');
    expect(c('Re: Frontend', 'Ahoj, díky za zprávu, zavoláme se?')).toBe('reply');
    expect(c('New jobs for you', '', 'jobalerts-noreply@linkedin.com')).toBe('reply');
  });
  it('suggests the matching status, never backwards from an ending', () => {
    expect(suggestedStatus('rejection', 'applied')).toBe('rejected');
    expect(suggestedStatus('receipt', 'interested')).toBe('applied');
    expect(suggestedStatus('receipt', 'talking')).toBeNull();
    expect(suggestedStatus('invite', 'talking')).toBe('interview');
    expect(suggestedStatus('invite', 'interview')).toBeNull();
    expect(suggestedStatus('reply', 'applied')).toBe('talking');
    expect(suggestedStatus('reply', 'interview')).toBeNull();
    expect(suggestedStatus('rejection', 'passed')).toBeNull();
    expect(suggestedStatus('offer', 'ghosted')).toBe('offer');
  });
});
