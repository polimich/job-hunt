/** Any other careers page: readable text of the page, and "open" judged by the HTTP status alone. */
import { fetchText, fromFirstHeading, htmlToText } from '../http.ts';
import type { Detail } from './types.ts';

export async function detail(url: string): Promise<Detail> {
  const { status, body } = await fetchText(url, {}, 2);
  if (status === 404 || status === 410) return { open: false, text: '' };
  if (status !== 200) return { open: null, text: '' };
  const main = /<main[\s\S]*?<\/main>/i.exec(body)?.[0] ?? /<body[\s\S]*<\/body>/i.exec(body)?.[0] ?? body;
  return { open: true, text: htmlToText(fromFirstHeading(main)) };
}
