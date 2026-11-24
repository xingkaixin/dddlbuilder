import { createHighlighterCoreSync, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import oneDarkPro from 'shiki/themes/one-dark-pro.mjs';
import oneLight from 'shiki/themes/one-light.mjs';
import type { HighlightResult } from './sqlTokenizer';

export type OrmCodeLanguage = 'prisma' | 'typescript' | 'python' | 'go' | 'java';

let highlighter: HighlighterCore | null = null;
const loadedLanguages = new Set<OrmCodeLanguage>();
const loadingPromises = new Map<OrmCodeLanguage, Promise<void>>();

const getHighlighter = () => {
  highlighter ??= createHighlighterCoreSync({
    langs: [],
    themes: [oneDarkPro, oneLight],
    engine: createJavaScriptRegexEngine(),
  });

  return highlighter;
};

const importLanguage = (language: OrmCodeLanguage) => {
  switch (language) {
    case 'prisma':
      return import('shiki/langs/prisma.mjs');
    case 'typescript':
      return import('shiki/langs/typescript.mjs');
    case 'python':
      return import('shiki/langs/python.mjs');
    case 'go':
      return import('shiki/langs/go.mjs');
    case 'java':
      return import('shiki/langs/java.mjs');
  }
};

export async function ensureOrmLanguageLoaded(language: OrmCodeLanguage): Promise<void> {
  if (loadedLanguages.has(language)) return;

  let pending = loadingPromises.get(language);

  if (!pending) {
    pending = importLanguage(language)
      .then((mod) => {
        getHighlighter().loadLanguageSync(mod.default);
        loadedLanguages.add(language);
      })
      .finally(() => {
        loadingPromises.delete(language);
      });
    loadingPromises.set(language, pending);
  }

  await pending;
}

export function highlightOrmCode(
  code: string,
  language: OrmCodeLanguage,
  mode: 'light' | 'dark',
): HighlightResult | null {
  if (!loadedLanguages.has(language)) return null;

  const theme = mode === 'dark' ? 'one-dark-pro' : 'one-light';
  const result = getHighlighter().codeToTokens(code, { lang: language, theme });

  return {
    fg: result.fg ?? (mode === 'dark' ? '#abb2bf' : '#383a42'),
    tokens: result.tokens,
  };
}
