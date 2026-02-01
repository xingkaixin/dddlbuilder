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
import { track } from '@vercel/analytics';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Copy,
  Check,
  ScrollText,
  ShieldCheck,
  GraduationCap,
  History,
} from 'lucide-react';
import { DATABASE_OPTIONS } from '@/utils/constants';
import { ReviewResultPanel } from './ReviewResult';

interface DDLOutputProps {
  generatedSql: string;
  generatedDcl: string;
  dbType: DatabaseType;
  onCopySql: () => Promise<boolean>;
  onCopyDcl: () => Promise<boolean>;
  // Review props
  isReviewing: boolean;
  reviewPartialResult: PartialReviewResult | null;
  reviewResult: ReviewResult | null;
  reviewError: string | null;
  onStartReview: () => void;
  onViewReviewHistory?: () => void;
  onApplySuggestion?: (suggestion: any) => void;
}

const SqlCodeBlock = lazy(() => import('./SqlCodeBlock'));

const CODE_FALLBACK_STYLE: CSSProperties = {
  fontFamily: '"Roboto Mono", monospace',
  fontSize: '0.775rem',
  whiteSpace: 'pre-wrap',
  background: 'transparent',
  margin: 0,
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
    onViewReviewHistory,
    onApplySuggestion,
  }) => {
    const databaseOption = useMemo(
      () => DATABASE_OPTIONS.find((option) => option.value === dbType),
      [dbType],
    );
    const databaseLabel = databaseOption?.label ?? dbType.toUpperCase();
    const DatabaseIcon = databaseOption?.icon;

    const renderDatabaseBadge = () => (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
        {DatabaseIcon && <DatabaseIcon className="h-3.5 w-3.5" />}
        {databaseLabel}
      </span>
    );

    const [isSqlCopied, setIsSqlCopied] = useState(false);
    const [isDclCopied, setIsDclCopied] = useState(false);
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
      track('sql_copy_ddl', { dbType });
      if (sqlTimerRef.current) window.clearTimeout(sqlTimerRef.current);
      setIsSqlCopied(true);
      sqlTimerRef.current = window.setTimeout(
        () => setIsSqlCopied(false),
        3000,
      );
    }, [onCopySql, dbType]);

    const handleCopyDcl = useCallback(async () => {
      const success = await onCopyDcl();
      if (!success) return;
      track('sql_copy_dcl', { dbType });
      if (dclTimerRef.current) window.clearTimeout(dclTimerRef.current);
      setIsDclCopied(true);
      dclTimerRef.current = window.setTimeout(
        () => setIsDclCopied(false),
        3000,
      );
    }, [onCopyDcl, dbType]);

    const canReview = generatedSql && !generatedSql.startsWith('--');

    return (
      <div className="relative flex w-full flex-col rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 lg:max-w-xl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-primary/30 to-transparent rounded-t-lg" />

        <Tabs defaultValue="ddl" className="relative flex flex-col">
          <div className="border-b border-primary/10 px-4 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ddl" className="w-full gap-2">
                <ScrollText className="h-4 w-4" />
                <span>建表 DDL</span>
              </TabsTrigger>
              <TabsTrigger value="dcl" className="w-full gap-2">
                <ShieldCheck className="h-4 w-4" />
                <span>授权 DCL</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* DDL Tab */}
          <TabsContent value="ddl" className="mt-0">
            <div className="relative flex flex-col">
              <div className="border-b border-primary/10 px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold bg-linear-to-r from-foreground to-primary bg-clip-text text-transparent transition-colors duration-200">
                        建表 DDL
                      </h2>
                      <span className="transition-transform duration-200 hover:scale-105">
                        {renderDatabaseBadge()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground/80">
                      根据左侧输入实时生成不同数据库的建表语句
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md"
                      onClick={onStartReview}
                      disabled={!canReview || isReviewing}
                    >
                      <GraduationCap className="h-4 w-4" />
                      大师评审
                    </Button>
                    {onViewReviewHistory && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 transition-all duration-200 hover:scale-105"
                        onClick={onViewReviewHistory}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md"
                      onClick={handleCopySql}
                    >
                      {isSqlCopied ? (
                        <>
                          <Check className="h-4 w-4 transition-transform duration-200" />{' '}
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 transition-transform duration-200" />{' '}
                          复制DDL
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="relative flex-1 overflow-auto px-4 py-3.5">
                <Suspense
                  fallback={
                    <pre style={CODE_FALLBACK_STYLE}>
                      {generatedSql || '-- 请在左侧填写表信息'}
                    </pre>
                  }
                >
                  <SqlCodeBlock
                    code={generatedSql || '-- 请在左侧填写表信息'}
                  />
                </Suspense>
              </div>
              {/* Review Result Panel */}
              <div className="px-4 pb-4">
                <ReviewResultPanel
                  isLoading={isReviewing}
                  partialResult={reviewPartialResult}
                  result={reviewResult}
                  error={reviewError}
                  onApplySuggestion={onApplySuggestion}
                />
              </div>
            </div>
          </TabsContent>

          {/* DCL Tab */}
          <TabsContent value="dcl" className="mt-0">
            <div className="relative flex flex-col">
              <div className="border-b border-primary/10 px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold bg-linear-to-r from-foreground to-primary bg-clip-text text-transparent transition-colors duration-200">
                        授权 DCL
                      </h2>
                      <span className="transition-transform duration-200 hover:scale-105">
                        {renderDatabaseBadge()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground/80">
                      生成数据库授权语句（GRANT）
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md"
                    onClick={handleCopyDcl}
                  >
                    {isDclCopied ? (
                      <>
                        <Check className="h-4 w-4 transition-transform duration-200" />{' '}
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 transition-transform duration-200" />{' '}
                        复制DCL
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <div className="relative flex-1 overflow-auto px-4 py-3.5">
                <Suspense
                  fallback={
                    <pre style={CODE_FALLBACK_STYLE}>
                      {generatedDcl || '-- 请配置授权对象'}
                    </pre>
                  }
                >
                  <SqlCodeBlock code={generatedDcl || '-- 请配置授权对象'} />
                </Suspense>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  },
);
