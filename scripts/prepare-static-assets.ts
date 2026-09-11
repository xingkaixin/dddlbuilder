import { createHash } from 'node:crypto';
import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_CSP_POLICY } from '../apps/worker/server-api/lib/csp.js';

const assetsDirectory = 'apps/web/dist/client';

await cp('apps/docs/.vitepress/dist', join(assetsDirectory, 'docs'), { recursive: true });

const scriptHashes = new Set<string>();
const files = await readdir(assetsDirectory, { recursive: true });

for (const file of files.sort()) {
  if (!file.endsWith('.html')) continue;
  const html = await readFile(join(assetsDirectory, file), 'utf8');

  for (const [, attributes, script] of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    if (/\bsrc\s*=/i.test(attributes) || !script.trim()) continue;
    scriptHashes.add(`'sha256-${createHash('sha256').update(script).digest('base64')}'`);
  }
}

const policy = DEFAULT_CSP_POLICY.replace(
  'script-src ',
  `script-src ${[...scriptHashes].join(' ')} `,
);
const policyHeader = `  Content-Security-Policy: ${policy}`;

if (policyHeader.length > 2000) throw new Error('Static CSP exceeds the Cloudflare header limit');

const headers = await readFile('apps/web/public/_headers', 'utf8');

await writeFile(join(assetsDirectory, '_headers'), `${headers}\n/*\n${policyHeader}\n`);
