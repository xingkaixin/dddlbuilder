import type { DatabaseType } from '@/types';
import type { CSSProperties } from 'react';
import type { ReviewResult } from '@/hooks/useDDLReview';
import type { PartialReviewResult } from '@/utils/parsePartialJson';
import {
  memo,
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
  lazy,
  Suspense,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Copy,
  Check,
  ScrollText,
  ShieldCheck,
  GraduationCap,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { DATABASE_OPTIONS } from '@/utils/constants';
import { ReviewResultPanel } from './ReviewResult';

interface DDLOutputProps {
  generatedSql: string;
  generatedDcl: string;
  dbType: DatabaseType;
  onCopySql: () => Promise<boolean>;
  onCopyDcl: () => Promise<boolean>;
  isReviewing: boolean;
  reviewPartialResult: PartialReviewResult | null;
  reviewResult: ReviewResult | null;
  reviewError: string | null;
  onStartReview: () => void;
}

// Code block component (lazy loaded)
void lazy(() => import('./SqlCodeBlock'));

const CODE_FALLBACK_STYLE: CSSProperties = {
  fontFamily: '"Roboto Mono", monospace',
  fontSize: '0.8125rem',
  whiteSpace: 'pre-wrap',
  background: 'transparent',
  margin: 0,
};

// Simple SQL syntax highlighter - returns React elements
const HighlightedSql = ({ sql }: { sql: string }) => {
  if (!sql) return null;

  const keywords =
    /\b(CREATE|TABLE|PRIMARY|KEY|UNIQUE|INDEX|FOREIGN|REFERENCES|NOT|NULL|DEFAULT|AUTO_INCREMENT|ON|UPDATE|DELETE|CASCADE|SET|CONSTRAINT|IF|EXISTS|DROP|ALTER|ADD|COLUMN|INT|VARCHAR|TEXT|DATETIME|TIMESTAMP|DECIMAL|FLOAT|DOUBLE|BOOLEAN|CHAR|BLOB|JSON|UUID|SERIAL|BIGINT|SMALLINT|TINYINT|MEDIUMINT)\b/gi;
  const strings = /'[^']*'/g;
  const comments = /--.*$/gm;
  const numbers = /\b\d+\.?\d*\b/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(
    `(${keywords.source}|${strings.source}|${comments.source}|${numbers.source})`,
    'gi',
  );

  sql.replace(regex, (match, _p1, offset) => {
    // Add text before match
    if (offset > lastIndex) {
      parts.push(
        <span key={`text-${offset}`}>{sql.slice(lastIndex, offset)}</span>,
      );
    }

    // Add highlighted match
    let className = '';
    if (keywords.test(match)) {
      className = 'token-keyword';
    } else if (strings.test(match)) {
      className = 'token-string';
    } else if (comments.test(match)) {
      className = 'token-comment';
    } else if (numbers.test(match)) {
      className = 'token-number';
    }

    if (className) {
      parts.push(
        <span key={`match-${offset}`} className={className}>
          {match}
        </span>,
      );
    } else {
      parts.push(<span key={`match-${offset}`}>{match}</span>);
    }

    lastIndex = offset + match.length;
    return match;
  });

  // Add remaining text
  if (lastIndex < sql.length) {
    parts.push(<span key="text-end">{sql.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
};

export const DDLOutput = memo<DDLOutputProps>(
  ({
    generatedSql,
    generatedDcl,
    dbType,
    onCopySql,
    onCopyDcl,
    isReviewing,
    reviewPartialResult,
    reviewResult,
    reviewError,
    onStartReview,
  }) => {
    const databaseOption = useMemo(
      () => DATABASE_OPTIONS.find((option) => option.value === dbType),
      [dbType],
    );
    const databaseLabel = databaseOption?.label ?? dbType.toUpperCase();
    const DatabaseIcon = databaseOption?.icon;

    const [isSqlCopied, setIsSqlCopied] = useState(false);
    const [isDclCopied, setIsDclCopied] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fullscreenTab, setFullscreenTab] = useState<'ddl' | 'dcl'>('ddl');
    const sqlTimerRef = useRef<number | undefined>(undefined);
    const dclTimerRef = useRef<number | undefined>(undefined);

    useEffect(() => {
      return () => {
        if (sqlTimerRef.current) window.clearTimeout(sqlTimerRef.current);
        if (dclTimerRef.current) window.clearTimeout(dclTimerRef.current);
      };
    }, []);

    const handleCopySql = useCallback(async () => {
      const success = await onCopySql();
      if (!success) return;
      if (sqlTimerRef.current) window.clearTimeout(sqlTimerRef.current);
      setIsSqlCopied(true);
      sqlTimerRef.current = window.setTimeout(
        () => setIsSqlCopied(false),
        3000,
      );
    }, [onCopySql]);

    const handleCopyDcl = useCallback(async () => {
      const success = await onCopyDcl();
      if (!success) return;
      if (dclTimerRef.current) window.clearTimeout(dclTimerRef.current);
      setIsDclCopied(true);
      dclTimerRef.current = window.setTimeout(
        () => setIsDclCopied(false),
        3000,
      );
    }, [onCopyDcl]);

    const canReview = generatedSql && !generatedSql.startsWith('--');

    // Generate line numbers
    const sqlLines = useMemo(() => generatedSql.split('\n'), [generatedSql]);
    const dclLines = useMemo(() => generatedDcl.split('\n'), [generatedDcl]);

    const renderCodeBlock = (_sqlCode: string, lines: string[]) => (
      <div className="code-block overflow-auto rounded-md">
        <div className="min-w-full">
          {lines.map((line, index) => (
            <div key={index} className="line group">
              <span className="line-content flex-1 px-2 py-0.5 font-mono text-sm">
                <HighlightedSql sql={line} />
              </span>
            </div>
          ))}
        </div>
      </div>
    );

    const renderDatabaseBadge = () => (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        {DatabaseIcon && <DatabaseIcon className="h-3.5 w-3.5" />}
        {databaseLabel}
      </span>
    );

    return (
      <>
        <div className="flex w-full flex-col rounded-lg border bg-card shadow-sm lg:max-w-xl">
          <Tabs defaultValue="ddl" className="flex flex-col">
            <div className="border-b px-4 pt-3">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="ddl" className="gap-2 text-sm">
                  <ScrollText className="h-4 w-4" />
                  <span>DDL</span>
                </TabsTrigger>
                <TabsTrigger value="dcl" className="gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4" />
                  <span>DCL</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* DDL Tab */}
            <TabsContent value="ddl" className="mt-0 flex flex-col">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">建表语句</h2>
                  {renderDatabaseBadge()}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onStartReview}
                    disabled={!canReview || isReviewing}
                    title="大师评审"
                  >
                    <GraduationCap className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setFullscreenTab('ddl');
                      setIsFullscreen(true);
                    }}
                    title="全屏查看"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCopySql}
                    title={isSqlCopied ? '已复制' : '复制'}
                  >
                    {isSqlCopied ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <Suspense
                  fallback={
                    <pre style={CODE_FALLBACK_STYLE}>
                      {generatedSql || '-- 请在左侧填写表信息'}
                    </pre>
                  }
                >
                  {renderCodeBlock(generatedSql, sqlLines)}
                </Suspense>
              </div>

              {/* Review Result */}
              <div className="border-t px-4 py-3">
                <ReviewResultPanel
                  isLoading={isReviewing}
                  partialResult={reviewPartialResult}
                  result={reviewResult}
                  error={reviewError}
                />
              </div>
            </TabsContent>

            {/* DCL Tab */}
            <TabsContent value="dcl" className="mt-0 flex flex-col">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">授权语句</h2>
                  {renderDatabaseBadge()}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setFullscreenTab('dcl');
                      setIsFullscreen(true);
                    }}
                    title="全屏查看"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCopyDcl}
                    title={isDclCopied ? '已复制' : '复制'}
                  >
                    {isDclCopied ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <Suspense
                  fallback={
                    <pre style={CODE_FALLBACK_STYLE}>
                      {generatedDcl || '-- 请配置授权对象'}
                    </pre>
                  }
                >
                  {renderCodeBlock(generatedDcl, dclLines)}
                </Suspense>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Fullscreen Dialog */}
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="max-w-6xl h-[90vh] p-0">
            <DialogHeader className="border-b px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-sm font-semibold">
                    {fullscreenTab === 'ddl' ? '建表 DDL' : '授权 DCL'}
                  </DialogTitle>
                  {renderDatabaseBadge()}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={
                      fullscreenTab === 'ddl' ? handleCopySql : handleCopyDcl
                    }
                    title="复制"
                  >
                    {(fullscreenTab === 'ddl' ? isSqlCopied : isDclCopied) ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsFullscreen(false)}
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-auto p-4">
              {fullscreenTab === 'ddl'
                ? renderCodeBlock(generatedSql, sqlLines)
                : renderCodeBlock(generatedDcl, dclLines)}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);
