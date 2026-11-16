import { describe, expect, it } from 'vitest';
import { citySlug, cityCode, hasAny, hasPhrase, matcher } from '../shared/search';

describe('phrase matching', () => {
  it('matches whole words in any order, ignoring case, diacritics and hyphens', () => {
    expect(hasPhrase('Senior Full-Stack Developer', 'full stack')).toBe(true);
    expect(hasPhrase('Fullstack vývojář', 'full stack')).toBe(true);
    expect(hasPhrase('Full stack engineer', 'fullstack')).toBe(true);
    expect(hasPhrase('Vyvojar webu', 'vývojář')).toBe(true);
    expect(hasPhrase('Developer, Frontend', 'frontend developer')).toBe(true);
  });
  it('does not match inside other words', () => {
    expect(hasPhrase('JavaScript Developer', 'java')).toBe(false);
    expect(hasPhrase('International Sales', 'intern')).toBe(false);
    expect(hasPhrase('C++ Engineer', 'c++')).toBe(true);
    expect(hasPhrase('Vue.js developer', 'vue')).toBe(true);
  });
  it('treats an empty list as no match', () => {
    expect(hasAny('anything', [])).toBe(false);
    expect(matcher(['', ' '])('anything')).toBe(false);
  });
});

describe('towns', () => {
  it('finds RÚIAN codes with or without diacritics', () => {
    expect(cityCode('brno')).toBe(582786);
    expect(cityCode('Plzen')).toBe(554791);
    expect(cityCode('Kocourkov')).toBeUndefined();
    expect(citySlug('Hradec Králové')).toBe('hradec-kralove');
  });
});
