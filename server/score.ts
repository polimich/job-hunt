/** Keyword heuristics applied to postings found on refresh. Hand-made assessments are never overwritten. */
import { fold, hasAny } from '../shared/search.ts';
import type { Level, Listing } from '../shared/types.ts';

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

export interface FitProfile {
  skills: string[];
  keywords: string[];
  level: Level;
}

const LEAD = /\b(staff|principal|lead|head|architect|manager|director|vedouc)/i;
const SENIOR = /\bsenior\b|\bsr\.?\b/i;
const JUNIOR = /\bjunior\b|\bintern\b|\btrainee\b|\bgraduate\b|\bstáž|\babsolvent/i;

function levelBonus(title: string, level: Level): number {
  const lead = LEAD.test(title);
  const senior = !lead && SENIOR.test(title);
  const junior = JUNIOR.test(title);
  switch (level) {
    case 'junior':
      return lead || senior ? -1 : junior ? 0.3 : 0;
    case 'medior':
      return lead ? -1 : senior ? -0.3 : junior ? -0.8 : 0;
    case 'senior':
      return junior ? -1 : lead ? -0.5 : senior ? 0.2 : 0;
    case 'lead':
      return junior ? -1.2 : lead ? 0.3 : 0;
    default:
      return 0;
  }
}

/**
 * Rough 1–5 match for a posting nobody has read yet: how much of its stack is in my skills,
 * whether the title has one of my keywords, my seniority, and whether the place suits me.
 * It is a sorting aid, not an assessment.
 */
export function autoFit(title: string, text: string, place: Listing['place'], p: FitProfile): number {
  const tags = extractTags(`${title}\n${text}`);
  const mine = new Set(p.skills.map(fold));
  let score = 2.2;
  if (mine.size && tags.length) {
    const known = tags.filter((t) => mine.has(fold(t))).length;
    const other = tags.length - known;
    score += Math.min(2, known * 0.7) - Math.min(1.5, other * 0.5);
    if (!known) score -= 0.5;
  }
  if (hasAny(title, p.keywords)) score += 0.5;
  score += levelBonus(title, p.level);
  if (place === 'jinde') score -= 1;
  else score += 0.4;
  return Math.max(1, Math.min(5, Math.round(score)));
}
