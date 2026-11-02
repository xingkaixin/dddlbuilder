import type { Element, ElementContent, Root } from 'hast';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { DOCS_BASE } from '../lib/site';
import { slugify } from '../lib/slugify';

const HEADING = /^h[1-6]$/;
const CUSTOM_ID = /\s*\{#([^}]+)\}\s*$/;
const CHANGELOG_PATH = /changelog\/changelog\.md$/;
const CHANGELOG_HEADING = /^\[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})$/;

function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value;

  return node.type === 'element' ? node.children.map(textOf).join('') : '';
}

function takeCustomId(heading: Element): string | undefined {
  const last = heading.children.at(-1);

  if (last?.type !== 'text') return undefined;

  const match = CUSTOM_ID.exec(last.value);

  if (!match) return undefined;

  last.value = last.value.slice(0, match.index);

  return match[1];
}

function uniqueId(slug: string, used: Set<string>): string {
  let id = slug;

  for (let suffix = 1; used.has(id); suffix++) id = `${slug}-${suffix}`;
  used.add(id);

  return id;
}

function span(className: string, children: ElementContent[]): Element {
  return { type: 'element', tagName: 'span', properties: { className: [className] }, children };
}

function formatChangelogHeading(heading: Element) {
  const match = CHANGELOG_HEADING.exec(heading.children.map(textOf).join('').trim());

  if (!match) return;

  const [, version = '', date = ''] = match;
  heading.children = [
    span('ddl-changelog-heading', [
      span('ddl-changelog-version', [{ type: 'text', value: version }]),
      { type: 'text', value: ' ' },
      span('ddl-changelog-date', [{ type: 'text', value: date }]),
    ]),
  ];
}

function anchorFor(id: string, text: string): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: {
      className: ['header-anchor'],
      href: `#${id}`,
      ariaLabel: `Permalink to "${text}"`,
    },
    children: [],
  };
}

function rewriteLink(link: Element) {
  const href = String(link.properties.href ?? '');

  if (/^https?:/.test(href)) {
    link.properties.target = '_blank';
    link.properties.rel = ['noreferrer'];
  } else if (href.startsWith('/')) {
    link.properties.href = `${DOCS_BASE}${href}`;
  }
}

export function rehypeDocs() {
  return (tree: Root, file: VFile) => {
    const usedIds = new Set<string>();
    const isChangelog = CHANGELOG_PATH.test(file.path);

    visit(tree, 'element', (node) => {
      if (node.tagName === 'a') {
        rewriteLink(node);

        return;
      }

      if (!HEADING.test(node.tagName)) return;

      const customId = takeCustomId(node);
      const text = node.children.map(textOf).join('').trim();
      const id = uniqueId(customId ?? slugify(text), usedIds);

      node.properties.id = id;

      if (isChangelog && node.tagName === 'h2') formatChangelogHeading(node);
      node.children.push(anchorFor(id, text));

      return 'skip';
    });
  };
}
