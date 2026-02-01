import { useRef } from 'react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomOneLight } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql';
import { ExplainPopover } from './ExplainPopover';

interface SqlCodeBlockProps {
  code: string;
}

SyntaxHighlighter.registerLanguage('sql', sql);

const CODE_BLOCK_STYLE = {
  fontFamily: '"Roboto Mono", monospace',
  fontSize: '0.775rem',
  whiteSpace: 'pre-wrap',
  background: 'transparent',
};

export default function SqlCodeBlock({ code }: SqlCodeBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef}>
      <ExplainPopover containerRef={containerRef}>
        <SyntaxHighlighter
          language="sql"
          style={atomOneLight}
          customStyle={CODE_BLOCK_STYLE}
          showLineNumbers
        >
          {code}
        </SyntaxHighlighter>
      </ExplainPopover>
    </div>
  );
}
