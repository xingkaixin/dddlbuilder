import { useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';
import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import sql from 'shiki/langs/sql.mjs';
import oneDarkPro from 'shiki/themes/one-dark-pro.mjs';
import oneLight from 'shiki/themes/one-light.mjs';
import { ExplainPopover } from './ExplainPopover';

interface SqlCodeBlockProps {
  code: string;
  activeLine?: number;
}

const highlighter = createHighlighterCoreSync({
  langs: [sql],
  themes: [oneDarkPro, oneLight],
  engine: createJavaScriptRegexEngine(),
});

function revealInPane(line: HTMLElement | null) {
  const pane = line?.closest('[data-testid="generated-results"]');

  if (!line || !pane) return;
  const lineBox = line.getBoundingClientRect();
  const paneBox = pane.getBoundingClientRect();

  if (lineBox.top < paneBox.top) pane.scrollTop -= paneBox.top - lineBox.top;
  else if (lineBox.bottom > paneBox.bottom) pane.scrollTop += lineBox.bottom - paneBox.bottom;
}

export function SqlCodeBlock({ code, activeLine }: SqlCodeBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? 'one-dark-pro' : 'one-light';

  const highlighted = useMemo(
    () => highlighter.codeToTokens(code, { lang: 'sql', theme }),
    [code, theme],
  );

  return (
    <div ref={containerRef}>
      <ExplainPopover containerRef={containerRef}>
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
                      textDecoration:
                        token.fontStyle && token.fontStyle & 4 ? 'underline' : undefined,
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
      </ExplainPopover>
    </div>
  );
}
