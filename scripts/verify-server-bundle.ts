import { existsSync, readFileSync } from 'node:fs';

const serverBundlePath = 'dist/server.js';

if (!existsSync(serverBundlePath)) {
  throw new Error(`Missing server bundle: ${serverBundlePath}`);
}

const bundleContent = readFileSync(serverBundlePath, 'utf8');
const forbiddenPatterns: Array<[RegExp, string]> = [
  [/import\(\s*["']\.\/[^"']+\.js["']\s*\)/, 'relative dynamic import'],
  [/SqlParser-[\w-]+\.js/, 'split SqlParser chunk reference'],
  [/node-sql-parser-[\w-]+\.js/, 'split node-sql-parser chunk reference'],
];

for (const [pattern, label] of forbiddenPatterns) {
  if (pattern.test(bundleContent)) {
    throw new Error(
      `Server bundle must stay self-contained for Worker runtime: found ${label} in ${serverBundlePath}`,
    );
  }
}
