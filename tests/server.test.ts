import { describe, expect, it } from 'vitest';
import { htmlToText } from '../server/http';
import { autoFit, extractTags } from '../server/score';
import { placeOf } from '../shared/search';
import { linkedinId } from '../server/sources/linkedin';

describe('htmlToText', () => {
  it('keeps list items and paragraphs, drops scripts and entities', () => {
    const html = '<p>Hled&aacute;me &amp; nab&iacute;z&iacute;me</p><script>x()</script><ul><li>React</li><li>Vue</li></ul>';
    expect(htmlToText(html.replace('&aacute;', '&#225;').replaceAll('&iacute;', '&#237;'))).toBe('Hledáme & nabízíme\n\n• React\n• Vue');
  });
});

describe('scoring', () => {
  it('finds stack tags without confusing Java and JavaScript', () => {
    expect(extractTags('JavaScript, React and TypeScript')).toEqual(['React', 'TypeScript']);
    expect(extractTags('Java and Spring')).toEqual(['Java']);
  });
  it('buckets places relative to the search town', () => {
    expect(placeOf('Brno, Czechia', '', 'Brno')).toBe('local');
    expect(placeOf('Czechia', 'remote', 'Brno')).toBe('remote');
    expect(placeOf('Prague', 'hybrid', 'Brno')).toBe('jinde');
    expect(placeOf('Praha 5', 'hybrid', 'Praha')).toBe('local');
    expect(placeOf('Ostrava', '', '')).toBe('local');
  });
  const me = { skills: ['React', 'TypeScript', 'Next.js'], keywords: ['frontend developer'], level: 'medior' as const };
  it('rates a role matching my skills and town above a staff role in another stack elsewhere', () => {
    expect(autoFit('Frontend Developer', 'React, TypeScript, Next.js', 'local', me)).toBeGreaterThanOrEqual(4);
    expect(autoFit('Staff Java Engineer', 'Java, Spring', 'jinde', me)).toBe(1);
  });
  it('follows the seniority I am after', () => {
    const junior = { ...me, level: 'junior' as const };
    expect(autoFit('Junior Frontend Developer', 'React', 'local', junior)).toBeGreaterThan(autoFit('Senior Frontend Developer', 'React', 'local', junior));
  });
  it('stays neutral without skills', () => {
    expect(autoFit('Účetní', 'Pohoda, fakturace', 'local', { skills: [], keywords: ['účetní'], level: 'any' })).toBe(3);
  });
});

describe('linkedinId', () => {
  it('reads the id from both URL shapes', () => {
    expect(linkedinId('https://cz.linkedin.com/jobs/view/software-engineer-at-acme-4475293675')).toBe('4475293675');
    expect(linkedinId('https://www.linkedin.com/jobs/view/4489334482')).toBe('4489334482');
  });
});
