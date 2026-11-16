/** Small HTTP helpers for the scrapers: polite fetch with retry, and HTML to plain text. */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FetchResult {
  status: number;
  body: string;
}

/**
 * Fetch a page as text. Rate-limit answers (429, LinkedIn's 999) are retried with a growing
 * pause; other failures return the status with an empty body so the caller can decide.
 */
export async function fetchText(url: string, init: RequestInit = {}, tries = 5): Promise<FetchResult> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': UA, 'Accept-Language': 'cs,en;q=0.8', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(25_000),
      });
      lastStatus = res.status;
      if (res.status === 429 || res.status === 999) {
        await sleep(20_000 * (attempt + 1));
        continue;
      }
      return { status: res.status, body: res.ok ? await res.text() : '' };
    } catch {
      await sleep(3_000);
    }
  }
  return { status: lastStatus, body: '' };
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** The page from its first <h1> on, which drops navigation and breadcrumbs above the posting. */
export function fromFirstHeading(html: string): string {
  const i = html.search(/<h1[\s>]/i);
  return i > 0 ? html.slice(i) : html;
}

/** Turn an HTML fragment into readable text, keeping paragraph and list breaks. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|ul|ol|h[1-6]|section|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(withBreaks)
    .replace(/[ \t\r ​‌﻿]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n•(?=\n|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
