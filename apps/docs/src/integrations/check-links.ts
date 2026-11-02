import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { DOCS_BASE } from '../lib/site';

const INTERNAL_LINK = new RegExp(`href="${DOCS_BASE}/([^"]*)"`, 'g');
const ID = /\sid="([^"]+)"/g;

async function pageIds(root: string): Promise<Map<string, Set<string>>> {
  const pages = new Map<string, Set<string>>();
  const entries = await readdir(root, { recursive: true });

  for (const entry of entries.filter((name) => name.endsWith('.html'))) {
    const html = await readFile(join(root, entry), 'utf8');
    pages.set(entry, new Set(Array.from(html.matchAll(ID), (match) => match[1] ?? '')));
  }

  return pages;
}

function resolvePage(pages: Map<string, Set<string>>, path: string): string | undefined {
  const candidates = path === '' || path.endsWith('/') ? [`${path}index.html`] : [`${path}.html`];

  return candidates.find((candidate) => pages.has(candidate));
}

export function checkInternalLinks(): AstroIntegration {
  return {
    name: 'ddlbuilder:check-internal-links',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const root = fileURLToPath(dir);
        const pages = await pageIds(root);
        const dead: string[] = [];

        for (const page of pages.keys()) {
          const html = await readFile(join(root, page), 'utf8');

          for (const [, target = ''] of html.matchAll(INTERNAL_LINK)) {
            if (/^(_astro|.*\.[a-z0-9]+(?:$|#))/.test(target)) continue;

            const [path = '', hash] = decodeURIComponent(target.replaceAll('&amp;', '&')).split(
              '#',
            );
            const resolved = resolvePage(pages, path);
            const anchorExists = !hash || pages.get(resolved ?? '')?.has(hash);

            if (!resolved || !anchorExists) dead.push(`${relative('.', page)} -> ${target}`);
          }
        }

        if (dead.length > 0) throw new Error(`Dead internal links:\n${dead.join('\n')}`);
      },
    },
  };
}
