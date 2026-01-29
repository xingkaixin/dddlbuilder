import { memo } from 'react';
import {
  Star,
  Lightbulb,
  AlertCircle,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import type { ReviewResult } from '@/hooks/useDDLReview';
import type { PartialReviewResult } from '@/utils/parsePartialJson';

interface ReviewResultPanelProps {
  isLoading: boolean;
  partialResult: PartialReviewResult | null;
  result: ReviewResult | null;
  error: string | null;
}

type IssueSeverity = 'critical' | 'warning' | 'suggestion';

interface Issue {
  severity: IssueSeverity;
  message: string;
  code?: string;
}

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-emerald-500';
  if (score >= 6) return 'text-amber-500';
  return 'text-red-500';
}

function getScoreBgColor(score: number): string {
  if (score >= 8) return 'bg-emerald-500/10';
  if (score >= 6) return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

function getScoreBorderColor(score: number): string {
  if (score >= 8) return 'border-emerald-500/20';
  if (score >= 6) return 'border-amber-500/20';
  return 'border-red-500/20';
}

function getSeverityIcon(severity: IssueSeverity) {
  switch (severity) {
    case 'critical':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'suggestion':
      return <Lightbulb className="h-4 w-4 text-blue-500" />;
    default:
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  }
}

function getSeverityColor(severity: IssueSeverity): string {
  switch (severity) {
    case 'critical':
      return 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20';
    case 'warning':
      return 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20';
    case 'suggestion':
      return 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20';
    default:
      return 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20';
  }
}

function getSeverityLabel(severity: IssueSeverity): string {
  switch (severity) {
    case 'critical':
      return '严重问题';
    case 'warning':
      return '警告';
    case 'suggestion':
      return '建议';
    default:
      return '正常';
  }
}

function parseIssues(suggestions: string[]): Issue[] {
  return suggestions.map((suggestion) => {
    const lower = suggestion.toLowerCase();
    if (
      lower.includes('必须') ||
      lower.includes('严重') ||
      lower.includes('错误') ||
      lower.includes('缺少')
    ) {
      return { severity: 'critical' as IssueSeverity, message: suggestion };
    }
    if (
      lower.includes('建议') ||
      lower.includes('推荐') ||
      lower.includes('考虑')
    ) {
      return { severity: 'suggestion' as IssueSeverity, message: suggestion };
    }
    return { severity: 'warning' as IssueSeverity, message: suggestion };
  });
}

const SUGGESTION_SKELETON_COUNT = 3;

// Score Display Component
function ScoreDisplay({
  score,
  isStreaming,
}: {
  score: number;
  isStreaming?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${getScoreBgColor(score)} ${getScoreBorderColor(score)}`}
    >
      <Star className={`h-4 w-4 ${getScoreColor(score)}`} fill="currentColor" />
      <span className={`text-xl font-bold ${getScoreColor(score)}`}>
        {score}
      </span>
      <span className="text-xs text-muted-foreground">/10</span>
      {isStreaming && (
        <Loader2 className="ml-1 h-3 w-3 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

function ScoreSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-muted px-3 py-1.5">
      <div className="h-4 w-4 animate-pulse rounded-full bg-muted" />
      <div className="h-5 w-6 animate-pulse rounded bg-muted" />
      <div className="h-3 w-6 animate-pulse rounded bg-muted" />
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="flex-1 space-y-1.5">
      <div className="h-2.5 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}

// Timeline Item Component
function TimelineItem({ issue, index }: { issue: Issue; index: number }) {
  return (
    <div className="relative flex gap-3">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background ${
            issue.severity === 'critical'
              ? 'border-red-500'
              : issue.severity === 'warning'
                ? 'border-amber-500'
                : 'border-blue-500'
          }`}
        >
          <span className="text-[10px] font-medium">{index + 1}</span>
        </div>
        <div className="mt-1 h-full w-px bg-border" />
      </div>

      {/* Content */}
      <div
        className={`mb-3 flex-1 rounded-r-md border-l-2 p-2.5 ${getSeverityColor(issue.severity)}`}
      >
        <div className="mb-1 flex items-center gap-1.5">
          {getSeverityIcon(issue.severity)}
          <span className="text-xs font-medium text-muted-foreground">
            {getSeverityLabel(issue.severity)}
          </span>
        </div>
        <p className="text-sm leading-relaxed">{issue.message}</p>
      </div>
    </div>
  );
}

// Suggestions Timeline Component
function SuggestionsTimeline({
  issues,
  skeletonCount = 0,
  isStreaming,
}: {
  issues: Issue[];
  skeletonCount?: number;
  isStreaming?: boolean;
}) {
  if (issues.length === 0 && skeletonCount === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <ChevronRight className="h-4 w-4 text-primary" />
        <span>详细评审结果</span>
        {isStreaming && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="pl-2">
        {issues.map((issue, index) => (
          <TimelineItem key={index} issue={issue} index={index} />
        ))}

        {skeletonCount > 0 && (
          <div className="relative flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-muted bg-background">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              </div>
            </div>
            <div className="flex-1 space-y-2 py-1">
              {Array.from({ length: skeletonCount }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionsSkeleton({ count = SUGGESTION_SKELETON_COUNT }) {
  return (
    <div className="mt-4 pl-2">
      <div className="relative flex gap-3">
        <div className="flex flex-col items-center">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-muted bg-background">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        </div>
        <div className="flex-1 space-y-2 py-1">
          {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

export const ReviewResultPanel = memo<ReviewResultPanelProps>(
  ({ isLoading, partialResult, result, error }) => {
    const isStreaming = isLoading && !result;
    const displayResult = result || (isLoading ? partialResult : null);
    const suggestions = displayResult?.suggestions ?? [];
    const issues = parseIssues(suggestions);
    const missingSuggestionCount = isStreaming
      ? Math.max(1, SUGGESTION_SKELETON_COUNT - suggestions.length)
      : 0;

    // Calculate stats
    const criticalCount = issues.filter(
      (i) => i.severity === 'critical',
    ).length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const suggestionCount = issues.filter(
      (i) => i.severity === 'suggestion',
    ).length;

    if (!isLoading && !result && !error) {
      return null;
    }

    return (
      <div className="space-y-3">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-600 dark:border-red-900 dark:bg-red-950/30">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {(displayResult || isStreaming) && (
          <div className="rounded-lg border bg-card/50 p-3">
            {/* Header with Score and Stats */}
            <div className="flex flex-wrap items-start gap-3">
              {displayResult?.score !== undefined ? (
                <ScoreDisplay
                  score={displayResult.score}
                  isStreaming={isStreaming}
                />
              ) : (
                isStreaming && <ScoreSkeleton />
              )}

              <div className="flex-1 min-w-[200px]">
                {displayResult?.summary ? (
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {displayResult.summary}
                    {isStreaming && (
                      <span className="ml-1 inline-flex">
                        <span className="animate-pulse text-muted-foreground">
                          ...
                        </span>
                      </span>
                    )}
                  </p>
                ) : (
                  isStreaming && <SummarySkeleton />
                )}
              </div>
            </div>

            {/* Stats */}
            {!isStreaming && issues.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {criticalCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                    <XCircle className="h-3 w-3" />
                    {criticalCount} 严重
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    {warningCount} 警告
                  </span>
                )}
                {suggestionCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400">
                    <Lightbulb className="h-3 w-3" />
                    {suggestionCount} 建议
                  </span>
                )}
              </div>
            )}

            {/* Timeline */}
            {issues.length > 0 && (
              <SuggestionsTimeline
                issues={issues}
                skeletonCount={missingSuggestionCount}
                isStreaming={isStreaming}
              />
            )}
            {isStreaming && issues.length === 0 && <SuggestionsSkeleton />}

            {/* Disclaimer */}
            {!isLoading && (
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/60">
                本评审结果为自动化结构分析与规则校验，仅用于技术参考，不构成质量结论、审计意见或设计否定，请结合实际业务语境自行判断。
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
);
