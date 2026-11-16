import { describe, expect, it } from 'vitest';
import { htmlToText } from '../server/http';
import { autoFit, extractTags, placeOf, vueMention } from '../server/score';
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
  it('says whether Vue is the main framework or one of several', () => {
    expect(vueMention('We use Vue.js and Nuxt')).toBe('hlavní framework');
    expect(vueMention('React or Vue')).toBe('zmíněno vedle jiných frameworků');
    expect(vueMention('Angular only')).toBe('');
  });
  it('buckets places', () => {
    expect(placeOf('Brno, Czechia', '')).toBe('brno');
    expect(placeOf('Czechia', 'remote')).toBe('remote');
    expect(placeOf('Prague', 'hybrid')).toBe('praha');
  });
  it('rates a React role in Brno above a staff Java role elsewhere', () => {
    const good = autoFit('Frontend Developer', 'React, TypeScript, Next.js', 'brno');
    const bad = autoFit('Staff Java Engineer', 'Java, Spring', 'jinde');
    expect(good).toBeGreaterThanOrEqual(4);
    expect(bad).toBe(1);
  });
});

describe('linkedinId', () => {
  it('reads the id from both URL shapes', () => {
    expect(linkedinId('https://cz.linkedin.com/jobs/view/software-engineer-at-acme-4475293675')).toBe('4475293675');
    expect(linkedinId('https://www.linkedin.com/jobs/view/4489334482')).toBe('4489334482');
  });
});
