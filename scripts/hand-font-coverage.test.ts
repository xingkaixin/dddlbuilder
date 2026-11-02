import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMMENT = /\/\*[\s\S]*?\*\/|\/\/.*/g;

function uiCharacters(...patterns: string[]): Set<string> {
  const files = patterns
    .flatMap((pattern) => globSync(pattern))
    .filter((file) => !file.includes('.test.') && !file.includes('__tests__'));

  const text = files.map((file) => readFileSync(file, 'utf8').replace(COMMENT, '')).join('');

  return new Set(Array.from(text).filter((character) => character >= ' '));
}

function subsetCodepoints(cssFile: string): Set<number> {
  const codepoints = new Set<number>();
  const css = readFileSync(cssFile, 'utf8');

  for (const [, start, end] of css.matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/g)) {
    const first = Number.parseInt(start ?? '', 16);
    const last = end ? Number.parseInt(end, 16) : first;

    for (let codepoint = first; codepoint <= last; codepoint++) codepoints.add(codepoint);
  }

  return codepoints;
}

function missingFrom(cssFile: string, characters: Set<string>): string[] {
  const covered = subsetCodepoints(cssFile);

  return [...characters].filter((character) => !covered.has(character.codePointAt(0) ?? 0));
}

describe('hand font subsets', () => {
  it.each([
    [
      'Xiaolai',
      'apps/web/src/assets/fonts/xiaolai/fonts.css',
      [
        'apps/web/src/i18n/locales/zh-CN/**/*.ts',
        'apps/web/src/i18n/locales/en-US/**/*.ts',
        'apps/web/src/components/**/*.{ts,tsx}',
      ],
    ],
    [
      'Klee One',
      'apps/web/src/assets/fonts/klee-one/fonts.css',
      ['apps/web/src/i18n/locales/ja-JP/**/*.ts'],
    ],
  ])(
    '%s covers the interface copy; if not, run `uv run scripts/subset-fonts.py`',
    (_, cssFile, sources) => {
      expect(missingFrom(cssFile, uiCharacters(...sources))).toEqual([]);
    },
  );
});
