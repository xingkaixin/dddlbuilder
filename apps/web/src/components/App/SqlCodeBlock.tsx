import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { ExplainPopover } from './ExplainPopover';
import { tokenizeSql, type HighlightResult } from './sqlTokenizer';
import type * as ShikiHighlighterModule from './shikiHighlighter';
import type { OrmCodeLanguage } from './shikiHighlighter';

export type CodeBlockLanguage = 'sql' | OrmCodeLanguage;

interface SqlCodeBlockProps {
  code: string;
  activeLine?: number;
  language?: CodeBlockLanguage;
}

type ShikiRuntime = typeof ShikiHighlighterModule;

let shikiRuntime: ShikiRuntime | null = null;
const loadingLanguages = new Set<OrmCodeLanguage>();
const languageListeners = new Set<() => void>();
let languageVersion = 0;

const subscribeLanguages = (listener: () => void) => {
  languageListeners.add(listener);

  return () => languageListeners.delete(listener);
};

const readLanguageVersion = () => languageVersion;

const loadOrmHighlighter = (language: OrmCodeLanguage) => {
  if (loadingLanguages.has(language)) return;
  loadingLanguages.add(language);

  void (shikiRuntime ? Promise.resolve(shikiRuntime) : import('./shikiHighlighter'))
    .then(async (runtime) => {
      shikiRuntime = runtime;
      await runtime.ensureOrmLanguageLoaded(language);
      languageVersion += 1;
      languageListeners.forEach((listener) => listener());
    })
    .catch(() => undefined)
    .finally(() => {
      loadingLanguages.delete(language);
    });
};

const plainTextTokens = (code: string, mode: 'light' | 'dark'): HighlightResult => {
  const fg = mode === 'dark' ? '#abb2bf' : '#383a42';

  return {
    fg,
    tokens: code.split('\n').map((line) => (line ? [{ content: line, color: fg }] : [])),
  };
};

function revealInPane(line: HTMLElement | null) {
  const pane = line?.closest('[data-testid="generated-results"]');

  if (!line || !pane) return;
  const lineBox = line.getBoundingClientRect();
  const paneBox = pane.getBoundingClientRect();

  if (lineBox.top < paneBox.top) pane.scrollTop -= paneBox.top - lineBox.top;
  else if (lineBox.bottom > paneBox.bottom) pane.scrollTop += lineBox.bottom - paneBox.bottom;
}

export function SqlCodeBlock({ code, activeLine, language = 'sql' }: SqlCodeBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const loadedVersion = useSyncExternalStore(subscribeLanguages, readLanguageVersion);

  const highlighted = useMemo<HighlightResult>(() => {
    void loadedVersion;

    if (language === 'sql') {
      return tokenizeSql(code, mode);
    }

    const ormResult = shikiRuntime?.highlightOrmCode(code, language, mode);

    if (ormResult) return ormResult;

    loadOrmHighlighter(language);

    return plainTextTokens(code, mode);
  }, [code, language, loadedVersion, mode]);

  const content = (
    <pre
      className="overflow-auto font-mono text-[13px] leading-[22px] whitespace-pre-wrap"
      style={{ color: highlighted.fg }}
    >
      <code style={{ fontFamily: 'inherit' }}>
        {highlighted.tokens.map((line, lineIndex) => (
          <span
            key={lineIndex}
            ref={lineIndex === activeLine ? revealInPane : undefined}
            data-active={lineIndex === activeLine || undefined}
            className="relative block min-h-[1lh] data-active:bg-[var(--mark)]"
            style={{ paddingLeft: `${String(highlighted.tokens.length).length + 2.25}ch` }}
          >
            <span
              aria-hidden="true"
              data-line={lineIndex + 1}
              className="pointer-events-none absolute left-0 select-none pr-[1em] text-right opacity-50 before:content-[attr(data-line)]"
              style={{ width: `${String(highlighted.tokens.length).length + 1.25}ch` }}
            />
            {line.map((token, tokenIndex) => (
              <span
                key={tokenIndex}
                style={{
                  color: token.color,
                  fontStyle: token.fontStyle && token.fontStyle & 1 ? 'italic' : undefined,
                  fontWeight: token.fontStyle && token.fontStyle & 2 ? 'bold' : undefined,
                  textDecoration: token.fontStyle && token.fontStyle & 4 ? 'underline' : undefined,
                }}
              >
                {token.content}
              </span>
            ))}
            {lineIndex < highlighted.tokens.length - 1 ? '\n' : null}
          </span>
        ))}
      </code>
    </pre>
  );

  return (
    <div ref={containerRef}>
      {language === 'sql' ? (
        <ExplainPopover containerRef={containerRef}>{content}</ExplainPopover>
      ) : (
        content
      )}
    </div>
  );
}
