/** Markdown from the chat as HTML. Raw HTML in the text is escaped, so the result is safe to show. */
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// Links open in a new tab and tell the target nothing about this app.
const plain = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]!.attrSet('target', '_blank');
  tokens[idx]!.attrSet('rel', 'noopener noreferrer');
  return plain(tokens, idx, options, env, self);
};

export const renderMarkdown = (text: string): string => md.render(text);
