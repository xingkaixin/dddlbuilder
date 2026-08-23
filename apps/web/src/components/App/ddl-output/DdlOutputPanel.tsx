import type { DatabaseType, SqlFormatMode } from '@ddlbuilder/shared-types';
import type {
  DDLReviewResult,
  DDLReviewStructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';
import type { PartialReviewResult } from '@/utils/parsePartialJson';
import type { SchemaLintIssue } from '@/utils/schemaLint';
import { AlignJustify, AlignLeft, GraduationCap, History } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ReviewResultPanel } from '../ReviewResult';
import { SchemaLintPanel } from '../SchemaLintPanel';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useTranslation } from 'react-i18next';
import { CopyOutputButton, OutputCode, OutputHeading } from './OutputPrimitives';

interface DdlOutputPanelProps {
  code: string;
  dbType: DatabaseType;
  formatMode: SqlFormatMode;
  onFormatModeChange: (mode: SqlFormatMode) => void;
  onCopy: () => Promise<boolean>;
  isReviewing: boolean;
  reviewPartialResult: PartialReviewResult | null;
  reviewResult: DDLReviewResult | null;
  reviewError: string | null;
  schemaLintIssues: SchemaLintIssue[];
  onStartReview: () => void;
  onViewReviewHistory?: () => void;
  onApplySuggestion?: (suggestion: DDLReviewStructuredSuggestion) => void;
}

export function DdlOutputPanel({
  code,
  dbType,
  formatMode,
  onFormatModeChange,
  onCopy,
  isReviewing,
  reviewPartialResult,
  reviewResult,
  reviewError,
  schemaLintIssues,
  onStartReview,
  onViewReviewHistory,
  onApplySuggestion,
}: DdlOutputPanelProps) {
  const { t } = useTranslation();
  const authSession = useAuthSession();
  const canReview = Boolean(code && !code.startsWith('--'));
  const formatControls = (
    <div className="inline-flex overflow-hidden rounded-md border border-border/70 bg-background shadow-xs">
      {(['compact', 'aligned'] as const).map((mode) => {
        const Icon = mode === 'compact' ? AlignLeft : AlignJustify;
        return (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t(`ddlOutput.${mode}`)}
                className={`h-7 min-w-0 rounded-none border-0 px-2 text-muted-foreground ${
                  formatMode === mode ? 'bg-muted text-foreground' : 'bg-transparent'
                }`}
                onClick={() => onFormatModeChange(mode)}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t(`ddlOutput.${mode}Tip`)}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );

  return (
    <div className="relative flex flex-col">
      <OutputHeading
        title={t('ddlOutput.ddlTitle')}
        description={t('ddlOutput.ddlDesc')}
        dbType={dbType}
        actions={
          <>
            {formatControls}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs font-medium"
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
                    : authSession.creditsStatus === 'ready' && (authSession.creditBalance ?? 0) <= 0
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
                    className="h-7 w-7 p-0"
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
            <CopyOutputButton
              copy={onCopy}
              label={t('ddlOutput.copyDdl')}
              tooltip={t('ddlOutput.copyDdlTip')}
            />
          </>
        }
      />
      <OutputCode code={code || t('ddlOutput.emptyDdl')} />
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
  );
}
