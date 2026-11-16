/** Keyword heuristics applied to postings found on refresh. Hand-made assessments are never overwritten. */
import type { Listing } from '../shared/types.ts';

const TAGS: [string, RegExp][] = [
  ['React', /\breact(?:\.?js)?\b/i],
  ['Next.js', /\bnext\.?js\b/i],
  ['TypeScript', /\btypescript\b/i],
  ['Vue', /\bvue(?:\.?js)?\b|\bnuxt\b/i],
  ['Angular', /\bangular\b/i],
  ['Svelte', /\bsvelte/i],
  ['Node', /\bnode(?:\.?js)?\b|\bnestjs\b/i],
  ['.NET', /\.net\b|\bc#|\bblazor\b/i],
  ['Python', /\bpython\b|\bfastapi\b|\bdjango\b/i],
  ['Java', /\bjava\b(?!script)|\bspring\b|\bkotlin\b/i],
  ['PHP', /\bphp\b|\bnette\b|\blaravel\b/i],
  ['Go', /\bgolang\b|\bgo\b(?= lang|,|\/| or| and)/],
  ['GraphQL', /\bgraphql\b/i],
  ['PostgreSQL', /\bpostgres/i],
  ['AWS', /\baws\b/i],
  ['Azure', /\bazure\b/i],
  ['MUI', /\bmui\b|material[ -]ui/i],
  ['AI', /\bllm\b|\bagentic\b|\bai agents?\b|\bclaude\b|\bcopilot\b|\bcursor\b/i],
];

export function extractTags(text: string): string[] {
  return TAGS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

export function vueMention(text: string): string {
  if (!/\bvue(?:\.?js)?\b|\bnuxt\b/i.test(text)) return '';
  return /\breact\b|\bangular\b|\bsvelte/i.test(text) ? 'zmíněno vedle jiných frameworků' : 'hlavní framework';
}

export function placeOf(location: string, mode: string): Listing['place'] {
  const where = `${location} ${mode}`.toLowerCase();
  if (/brno/.test(where)) return 'brno';
  if (/remote|na dálku|kdekoli/.test(where)) return 'remote';
  if (/praha|prague/.test(where)) return 'praha';
  return 'jinde';
}

/**
 * Rough 1–5 match for a posting nobody has read yet. It rewards the profile's stack
 * (React, TypeScript, Next.js, .NET), Brno or remote work, and penalises other main
 * stacks and titles above senior. It is a sorting aid, not an assessment.
 */
export function autoFit(title: string, text: string, place: Listing['place']): number {
  const all = `${title}\n${text}`;
  const tags = new Set(extractTags(all));
  let score = 2;
  if (tags.has('React')) score += 1.2;
  if (tags.has('TypeScript')) score += 0.6;
  if (tags.has('Next.js')) score += 0.3;
  if (tags.has('.NET')) score += 0.4;
  if (tags.has('Vue') && !tags.has('React')) score += 0.6;
  if (tags.has('MUI')) score += 0.2;
  if (/front[- ]?end|fullstack|full[- ]stack/i.test(title)) score += 0.4;
  if (!tags.has('React') && !tags.has('Vue')) score -= 0.8;
  if (/\bjava\b(?!script)|\bphp\b|\bangular\b|\bpython\b|\bgo\b/i.test(title)) score -= 0.8;
  if (/\b(staff|principal|lead|head|architect|manager)\b/i.test(title)) score -= 1;
  else if (/\bsenior\b|\bsr\.?\b/i.test(title)) score -= 0.3;
  if (/\bjunior\b|\bintern\b|\bstáž/i.test(title)) score -= 0.8;
  if (place === 'brno' || place === 'remote') score += 0.4;
  if (place === 'jinde') score -= 1;
  return Math.max(1, Math.min(5, Math.round(score)));
}
