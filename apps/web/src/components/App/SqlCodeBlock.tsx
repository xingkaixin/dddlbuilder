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
}

const highlighter = createHighlighterCoreSync({
  langs: [sql],
  themes: [oneDarkPro, oneLight],
  engine: createJavaScriptRegexEngine(),
});

export default function SqlCodeBlock({ code }: SqlCodeBlockProps) {
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
          className="overflow-auto whitespace-pre-wrap p-2"
          style={{
            fontFamily: '"Roboto Mono", monospace',
            fontSize: '0.775rem',
            color: highlighted.fg,
          }}
        >
          <code style={{ fontFamily: 'inherit' }}>
            {highlighted.tokens.map((line, lineIndex) => (
              <span
                key={lineIndex}
                className="relative block min-h-[1lh]"
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
