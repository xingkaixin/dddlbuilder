import type { Processor } from 'unified';

const FENCE = /^\s*(```|~~~)/;
const OPEN = /^:::\s*(info|tip|warning)(?:\s+(.*))?$/;
const CLOSE = /^:::\s*$/;

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// A closing ::: directly after a list is lazy paragraph text in the Markdown AST, so the containers
// become block HTML before parsing, with blank lines that keep Markdown active between the tags.
export function expandContainers(source: string): string {
  let fenced = false;

  return source
    .split('\n')
    .map((line) => {
      if (FENCE.test(line)) fenced = !fenced;

      if (fenced) return line;

      const open = OPEN.exec(line);

      if (open) {
        const [, kind = '', title] = open;
        const label = escapeHtml(title?.trim() || kind.toUpperCase());

        return `\n<div class="custom-block ${kind}">\n<p class="custom-block-title">${label}</p>\n`;
      }

      return CLOSE.test(line) ? '\n</div>\n' : line;
    })
    .join('\n');
}

export function remarkContainers(this: Processor) {
  const parse = this.parser;

  if (!parse) throw new Error('remarkContainers must run after remark-parse');

  this.parser = (document, file) => parse(expandContainers(document), file);
}
