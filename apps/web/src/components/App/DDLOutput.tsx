import type { DatabaseType, RoutineTemplateKind, SqlFormatMode } from '@ddlbuilder/shared-types';
import type { CSSProperties } from 'react';
import type { ReviewResult } from '@/hooks/useDDLReview';
import type { PartialReviewResult } from '@/utils/parsePartialJson';
import type { SchemaLintIssue } from '@/utils/schemaLint';
import { memo, useMemo, useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Copy,
  Check,
  ScrollText,
  ShieldCheck,
  GraduationCap,
  History,
  AlignLeft,
  AlignJustify,
  Workflow,
  Code,
} from 'lucide-react';
import { DATABASE_OPTIONS } from '@/utils/constants';
import { ReviewResultPanel } from './ReviewResult';
import { SchemaLintPanel } from './SchemaLintPanel';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { buildRoutineTemplateDDL } from '@ddlbuilder/ddl-core';
import type { ORMTarget } from '@ddlbuilder/ddl-core';
import { ORM_TARGET_OPTIONS } from '@/hooks/useOrmGeneration';

interface DDLOutputProps {
  generatedSql: string;
  generatedDcl: string;
  dbType: DatabaseType;
  routineTableNameDefault?: string;
  sqlFormatMode: SqlFormatMode;
  onSqlFormatModeChange: (mode: SqlFormatMode) => void;
  onCopySql: () => Promise<boolean>;
  onCopyDcl: () => Promise<boolean>;
  // ORM props
  generatedOrm: string;
  ormTarget: ORMTarget;
  onOrmTargetChange: (target: ORMTarget) => void;
  onCopyOrm: () => Promise<boolean>;
  // Review props
  isReviewing: boolean;
  reviewPartialResult: PartialReviewResult | null;
  reviewResult: ReviewResult | null;
  reviewError: string | null;
  schemaLintIssues: SchemaLintIssue[];
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
    routineTableNameDefault,
    sqlFormatMode,
    onSqlFormatModeChange,
    onCopySql,
    onCopyDcl,
    generatedOrm,
    ormTarget,
    onOrmTargetChange,
    onCopyOrm,
    isReviewing,
    reviewPartialResult,
    reviewResult,
    reviewError,
    schemaLintIssues,
    onStartReview,
    onViewReviewHistory,
    onApplySuggestion,
  }) => {
    const { t } = useTranslation();
    const authSession = useAuthSession();
    const trackEvent = useCallback((..._args: unknown[]) => {}, []);
    const { showToast } = useToast();
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
    const [isOrmCopied, setIsOrmCopied] = useState(false);
    const [isRoutineCopied, setIsRoutineCopied] = useState(false);
    const [routineKind, setRoutineKind] = useState<RoutineTemplateKind>('updated_at_trigger');
    const [routineName, setRoutineName] = useState('trg_set_updated_at');
    const [routineTableName, setRoutineTableName] = useState('');
    const [routineParameters, setRoutineParameters] = useState('');
    const [routineReturnType, setRoutineReturnType] = useState('INTEGER');
    const [routineTimestampColumn, setRoutineTimestampColumn] = useState('updated_at');
    const [routineAuditTableName, setRoutineAuditTableName] = useState('');
    const [routineBody, setRoutineBody] = useState('');
    const sqlTimerRef = useRef<number | undefined>(undefined);
    const dclTimerRef = useRef<number | undefined>(undefined);
    const ormTimerRef = useRef<number | undefined>(undefined);
    const routineTimerRef = useRef<number | undefined>(undefined);

    useEffect(() => {
      return () => {
        if (sqlTimerRef.current) window.clearTimeout(sqlTimerRef.current);
        if (dclTimerRef.current) window.clearTimeout(dclTimerRef.current);
        if (ormTimerRef.current) window.clearTimeout(ormTimerRef.current);
        if (routineTimerRef.current) window.clearTimeout(routineTimerRef.current);
      };
    }, []);

    useEffect(() => {
      if (routineTableNameDefault && !routineTableName) {
        setRoutineTableName(routineTableNameDefault);
      }
    }, [routineTableNameDefault, routineTableName]);

    const routineSql = useMemo(
      () =>
        buildRoutineTemplateDDL(dbType, {
          kind: routineKind,
          routineName,
          tableName: routineTableName,
          parameters: routineParameters,
          returnType: routineReturnType,
          body: routineBody,
          timestampColumn: routineTimestampColumn,
          auditTableName: routineAuditTableName,
        }),
      [
        dbType,
        routineKind,
        routineName,
        routineTableName,
        routineParameters,
        routineReturnType,
        routineBody,
        routineTimestampColumn,
        routineAuditTableName,
      ],
    );

    const handleCopySql = useCallback(async () => {
      const success = await onCopySql();
      if (!success) {
        showToast(t('ddlOutput.copyFailed'));
        return;
      }
      trackEvent('sql_copy_ddl', { dbType });
      if (sqlTimerRef.current) window.clearTimeout(sqlTimerRef.current);
      setIsSqlCopied(true);
      sqlTimerRef.current = window.setTimeout(() => setIsSqlCopied(false), 3000);
    }, [onCopySql, dbType, trackEvent, showToast, t]);

    const handleCopyDcl = useCallback(async () => {
      const success = await onCopyDcl();
      if (!success) {
        showToast(t('ddlOutput.copyFailed'));
        return;
      }
      trackEvent('sql_copy_dcl', { dbType });
      if (dclTimerRef.current) window.clearTimeout(dclTimerRef.current);
      setIsDclCopied(true);
      dclTimerRef.current = window.setTimeout(() => setIsDclCopied(false), 3000);
    }, [onCopyDcl, dbType, trackEvent, showToast, t]);

    const handleCopyOrm = useCallback(async () => {
      const success = await onCopyOrm();
      if (!success) {
        showToast(t('ddlOutput.copyFailed'));
        return;
      }
      trackEvent('orm_copy', { ormTarget });
      if (ormTimerRef.current) window.clearTimeout(ormTimerRef.current);
      setIsOrmCopied(true);
      ormTimerRef.current = window.setTimeout(() => setIsOrmCopied(false), 3000);
    }, [onCopyOrm, ormTarget, trackEvent, showToast, t]);

    const handleCopyRoutine = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(routineSql);
      } catch {
        try {
          const ta = document.createElement('textarea');
          ta.value = routineSql;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch {
          showToast(t('ddlOutput.copyFailed'));
          return;
        }
      }
      trackEvent('sql_copy_routine', { dbType, routineKind });
      if (routineTimerRef.current) window.clearTimeout(routineTimerRef.current);
      setIsRoutineCopied(true);
      routineTimerRef.current = window.setTimeout(() => setIsRoutineCopied(false), 3000);
    }, [routineSql, dbType, routineKind, trackEvent, showToast, t]);

    const canReview = generatedSql && !generatedSql.startsWith('--');

    return (
      <div className="relative flex w-full flex-col rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 xl:w-[34rem] xl:shrink-0 2xl:w-[38rem]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-primary/30 to-transparent rounded-t-lg" />

        <Tabs defaultValue="ddl" className="relative flex flex-col">
          <div className="border-b border-primary/10 px-4 pt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="ddl" className="w-full gap-2">
                <ScrollText className="h-4 w-4" />
                <span>{t('ddlOutput.ddlTab')}</span>
              </TabsTrigger>
              <TabsTrigger value="dcl" className="w-full gap-2">
                <ShieldCheck className="h-4 w-4" />
                <span>{t('ddlOutput.dclTab')}</span>
              </TabsTrigger>
              <TabsTrigger value="orm" className="w-full gap-2">
                <Code className="h-4 w-4" />
                <span>{t('ddlOutput.ormTab')}</span>
              </TabsTrigger>
              <TabsTrigger value="routine" className="w-full gap-2">
                <Workflow className="h-4 w-4" />
                <span>{t('ddlOutput.routineTab')}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* DDL Tab */}
          <TabsContent value="ddl" className="mt-0">
            <div className="relative flex flex-col">
              <div className="border-b border-primary/10 px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold bg-linear-to-r from-foreground to-primary bg-clip-text text-transparent transition-colors duration-200">
                        {t('ddlOutput.ddlTitle')}
                      </h2>
                      <span className="transition-transform duration-200 hover:scale-105">
                        {renderDatabaseBadge()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground/80">
                      {t('ddlOutput.ddlDesc')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <div className="inline-flex overflow-hidden rounded-md border border-border/70 bg-background shadow-xs">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('ddlOutput.compact')}
                            className={`h-7 min-w-0 rounded-none border-0 px-2 text-muted-foreground ${
                              sqlFormatMode === 'compact'
                                ? 'bg-muted text-foreground'
                                : 'bg-transparent'
                            }`}
                            onClick={() => onSqlFormatModeChange('compact')}
                          >
                            <AlignLeft className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('ddlOutput.compactTip')}</p>
                        </TooltipContent>
                      </Tooltip>
                      <div className="w-px bg-border/70" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('ddlOutput.aligned')}
                            className={`h-7 min-w-0 rounded-none border-0 px-2 text-muted-foreground ${
                              sqlFormatMode === 'aligned'
                                ? 'bg-muted text-foreground'
                                : 'bg-transparent'
                            }`}
                            onClick={() => onSqlFormatModeChange('aligned')}
                          >
                            <AlignJustify className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('ddlOutput.alignedTip')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex" tabIndex={!canReview || isReviewing ? 0 : -1}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md"
                            onClick={onStartReview}
                            disabled={!canReview || isReviewing}
                          >
                            <GraduationCap className="h-3.5 w-3.5" />
                            {t('ddlOutput.review')}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {authSession.status !== 'signed_in'
                            ? t('services.authRequired')
                            : authSession.creditsStatus === 'ready' &&
                                (authSession.creditBalance ?? 0) <= 0
                              ? t('services.creditExhausted')
                              : t('ddlOutput.reviewTip')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    {onViewReviewHistory && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 text-xs font-medium gap-1 transition-all duration-200 hover:scale-105 p-0"
                            onClick={onViewReviewHistory}
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('ddlOutput.reviewHistoryTip')}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md"
                          onClick={handleCopySql}
                        >
                          {isSqlCopied ? (
                            <>
                              <Check className="h-3.5 w-3.5 transition-transform duration-200" />{' '}
                              {t('ddlOutput.copied')}
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 transition-transform duration-200" />{' '}
                              {t('ddlOutput.copyDdl')}
                            </>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('ddlOutput.copyDdlTip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
              <div className="relative flex-1 overflow-auto px-4 py-3.5">
                <Suspense
                  fallback={
                    <pre style={CODE_FALLBACK_STYLE}>{generatedSql || t('ddlOutput.emptyDdl')}</pre>
                  }
                >
                  <SqlCodeBlock code={generatedSql || t('ddlOutput.emptyDdl')} />
                </Suspense>
              </div>
              {/* Review Result Panel */}
              <div className="px-4 pb-4">
                <SchemaLintPanel issues={schemaLintIssues} />
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
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold bg-linear-to-r from-foreground to-primary bg-clip-text text-transparent transition-colors duration-200">
                        {t('ddlOutput.dclTitle')}
                      </h2>
                      <span className="transition-transform duration-200 hover:scale-105">
                        {renderDatabaseBadge()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground/80">
                      {t('ddlOutput.dclDesc')}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md"
                        onClick={handleCopyDcl}
                      >
                        {isDclCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 transition-transform duration-200" />{' '}
                            {t('ddlOutput.copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 transition-transform duration-200" />{' '}
                            {t('ddlOutput.copyDcl')}
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('ddlOutput.copyDclTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="relative flex-1 overflow-auto px-4 py-3.5">
                <Suspense
                  fallback={
                    <pre style={CODE_FALLBACK_STYLE}>{generatedDcl || t('ddlOutput.emptyDcl')}</pre>
                  }
                >
                  <SqlCodeBlock code={generatedDcl || t('ddlOutput.emptyDcl')} />
                </Suspense>
              </div>
            </div>
          </TabsContent>

          {/* ORM Tab */}
          <TabsContent value="orm" className="mt-0">
            <div className="relative flex flex-col">
              <div className="border-b border-primary/10 px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold bg-linear-to-r from-foreground to-primary bg-clip-text text-transparent transition-colors duration-200">
                        {t('ddlOutput.ormTitle')}
                      </h2>
                    </div>
                    <p className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground/80">
                      {t('ddlOutput.ormDesc')}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md"
                        onClick={handleCopyOrm}
                      >
                        {isOrmCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 transition-transform duration-200" />{' '}
                            {t('ddlOutput.copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 transition-transform duration-200" />{' '}
                            {t('ddlOutput.copyOrm')}
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('ddlOutput.copyOrmTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="border-b border-primary/10 px-4 py-3.5">
                <div className="space-y-2">
                  <Label htmlFor="orm-target">{t('ddlOutput.ormFramework')}</Label>
                  <SearchableSelect
                    id="orm-target"
                    value={ormTarget}
                    onValueChange={(value) => onOrmTargetChange(value as ORMTarget)}
                    options={ORM_TARGET_OPTIONS}
                    triggerClassName="h-9 rounded-md px-3 py-2 text-sm"
                    emptyMessage={t('searchableSelect.empty')}
                  />
                </div>
              </div>
              <div className="relative flex-1 overflow-auto px-4 py-3.5">
                <Suspense
                  fallback={
                    <pre style={CODE_FALLBACK_STYLE}>{generatedOrm || t('ddlOutput.emptyOrm')}</pre>
                  }
                >
                  <SqlCodeBlock code={generatedOrm || t('ddlOutput.emptyOrm')} />
                </Suspense>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="routine" className="mt-0">
            <div className="relative flex flex-col">
              <div className="border-b border-primary/10 px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold bg-linear-to-r from-foreground to-primary bg-clip-text text-transparent transition-colors duration-200">
                        {t('ddlOutput.routineTitle')}
                      </h2>
                      <span className="transition-transform duration-200 hover:scale-105">
                        {renderDatabaseBadge()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground/80">
                      {t('ddlOutput.routineDesc')}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md"
                        onClick={handleCopyRoutine}
                      >
                        {isRoutineCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 transition-transform duration-200" />{' '}
                            {t('ddlOutput.copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 transition-transform duration-200" />{' '}
                            {t('ddlOutput.copyRoutine')}
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('ddlOutput.copyRoutineTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="grid gap-4 border-b border-primary/10 px-4 py-3.5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="routine-kind">{t('ddlOutput.routineKind')}</Label>
                  <SearchableSelect
                    id="routine-kind"
                    value={routineKind}
                    onValueChange={(value) => setRoutineKind(value as RoutineTemplateKind)}
                    options={[
                      { value: 'updated_at_trigger', label: t('ddlOutput.routineKinds.updatedAt') },
                      { value: 'audit_trigger', label: t('ddlOutput.routineKinds.audit') },
                      { value: 'procedure', label: t('ddlOutput.routineKinds.procedure') },
                      { value: 'function', label: t('ddlOutput.routineKinds.function') },
                      { value: 'custom_trigger', label: t('ddlOutput.routineKinds.trigger') },
                    ]}
                    triggerClassName="h-9 rounded-md px-3 py-2 text-sm"
                    emptyMessage={t('searchableSelect.empty')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="routine-name">{t('ddlOutput.routineName')}</Label>
                  <Input
                    id="routine-name"
                    value={routineName}
                    onChange={(event) => setRoutineName(event.target.value)}
                    placeholder={t('ddlOutput.routineNamePlaceholder')}
                  />
                </div>
                {routineKind !== 'procedure' && routineKind !== 'function' && (
                  <div className="space-y-2">
                    <Label htmlFor="routine-table">{t('ddlOutput.routineTable')}</Label>
                    <Input
                      id="routine-table"
                      value={routineTableName}
                      onChange={(event) => setRoutineTableName(event.target.value)}
                      placeholder={t('ddlOutput.routineTablePlaceholder')}
                    />
                  </div>
                )}
                {(routineKind === 'procedure' || routineKind === 'function') && (
                  <div className="space-y-2">
                    <Label htmlFor="routine-parameters">{t('ddlOutput.routineParameters')}</Label>
                    <Input
                      id="routine-parameters"
                      value={routineParameters}
                      onChange={(event) => setRoutineParameters(event.target.value)}
                      placeholder={t('ddlOutput.routineParametersPlaceholder')}
                    />
                  </div>
                )}
                {routineKind === 'function' && (
                  <div className="space-y-2">
                    <Label htmlFor="routine-return-type">{t('ddlOutput.routineReturnType')}</Label>
                    <Input
                      id="routine-return-type"
                      value={routineReturnType}
                      onChange={(event) => setRoutineReturnType(event.target.value)}
                      placeholder={t('ddlOutput.routineReturnTypePlaceholder')}
                    />
                  </div>
                )}
                {routineKind === 'updated_at_trigger' && (
                  <div className="space-y-2">
                    <Label htmlFor="routine-timestamp-column">
                      {t('ddlOutput.routineTimestampColumn')}
                    </Label>
                    <Input
                      id="routine-timestamp-column"
                      value={routineTimestampColumn}
                      onChange={(event) => setRoutineTimestampColumn(event.target.value)}
                      placeholder={t('ddlOutput.routineTimestampColumnPlaceholder')}
                    />
                  </div>
                )}
                {routineKind === 'audit_trigger' && (
                  <div className="space-y-2">
                    <Label htmlFor="routine-audit-table">{t('ddlOutput.routineAuditTable')}</Label>
                    <Input
                      id="routine-audit-table"
                      value={routineAuditTableName}
                      onChange={(event) => setRoutineAuditTableName(event.target.value)}
                      placeholder={t('ddlOutput.routineAuditTablePlaceholder')}
                    />
                  </div>
                )}
                {(routineKind === 'procedure' ||
                  routineKind === 'function' ||
                  routineKind === 'custom_trigger') && (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="routine-body">{t('ddlOutput.routineBody')}</Label>
                    <Textarea
                      id="routine-body"
                      value={routineBody}
                      onChange={(event) => setRoutineBody(event.target.value)}
                      placeholder={t('ddlOutput.routineBodyPlaceholder')}
                      className="min-h-24 font-mono text-sm"
                    />
                  </div>
                )}
              </div>
              <div className="relative flex-1 overflow-auto px-4 py-3.5">
                <Suspense fallback={<pre style={CODE_FALLBACK_STYLE}>{routineSql}</pre>}>
                  <SqlCodeBlock code={routineSql} />
                </Suspense>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  },
);
