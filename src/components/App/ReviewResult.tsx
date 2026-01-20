import { memo } from 'react';
import { Star, Lightbulb, AlertCircle, Loader2 } from 'lucide-react';
import type { ReviewResult } from '@/hooks/useDDLReview';
import type { PartialReviewResult } from '@/utils/parsePartialJson';

interface ReviewResultPanelProps {
  isLoading: boolean;
  partialResult: PartialReviewResult | null;
  result: ReviewResult | null;
  error: string | null;
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

const SUGGESTION_SKELETON_COUNT = 3;

// Shared component for rendering score
function ScoreDisplay({
  score,
  isStreaming,
}: {
  score: number;
  isStreaming?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-4 py-2 ${getScoreBgColor(score)}`}
    >
      <Star className={`h-5 w-5 ${getScoreColor(score)}`} fill="currentColor" />
      <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
        {score}
      </span>
      <span className="text-sm text-muted-foreground">/10</span>
      {isStreaming && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />
      )}
    </div>
  );
}

function ScoreSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-lg px-4 py-2 bg-muted/40">
      <div className="h-5 w-5 rounded-full bg-muted/70 animate-pulse" />
      <div className="h-6 w-8 rounded bg-muted/70 animate-pulse" />
      <div className="h-4 w-8 rounded bg-muted/70 animate-pulse" />
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="flex-1 space-y-2">
      <div className="h-3 w-3/4 rounded bg-muted/70 animate-pulse" />
      <div className="h-3 w-2/3 rounded bg-muted/70 animate-pulse" />
    </div>
  );
}

// Shared component for rendering suggestions
function SuggestionsList({
  suggestions,
  skeletonCount = 0,
  isStreaming,
}: {
  suggestions: string[];
  skeletonCount?: number;
  isStreaming?: boolean;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Lightbulb className="h-4 w-4" />
        <span>改进建议</span>
        {isStreaming && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
      <ul className="space-y-1.5 pl-6">
        {suggestions.map((suggestion, index) => (
          <li key={index} className="text-sm text-foreground/70 list-disc">
            {suggestion}
          </li>
        ))}
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <li
            key={`suggestion-skeleton-${index}`}
            className="list-disc text-sm"
          >
            <div className="h-3 w-11/12 rounded bg-muted/70 animate-pulse" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SuggestionsSkeleton({
  count = SUGGESTION_SKELETON_COUNT,
  showHeader = false,
}) {
  return (
    <div className="space-y-2">
      {showHeader && (
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
          <span>改进建议</span>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      )}
      <ul className="space-y-1.5 pl-6">
        {Array.from({ length: count }).map((_, index) => (
          <li
            key={`suggestion-skeleton-${index}`}
            className="list-disc text-sm"
          >
            <div className="h-3 w-11/12 rounded bg-muted/70 animate-pulse" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export const ReviewResultPanel = memo<ReviewResultPanelProps>(
  ({ isLoading, partialResult, result, error }) => {
    const isStreaming = isLoading && !result;
    // Determine what to show: final result or partial result during streaming
    const displayResult = result || (isLoading ? partialResult : null);
    const suggestions = displayResult?.suggestions ?? [];
    const missingSuggestionCount = isStreaming
      ? Math.max(1, SUGGESTION_SKELETON_COUNT - suggestions.length)
      : 0;

    if (!isLoading && !result && !error) {
      return null;
    }

    return (
      <div className="mt-4 rounded-lg border border-primary/10 bg-card/50 p-4">
        {error && (
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Progressive rendering of result */}
        {(displayResult || isStreaming) && (
          <div className="space-y-4">
            {/* Score - show as soon as it's available */}
            <div className="flex items-center gap-4">
              {displayResult?.score !== undefined ? (
                <ScoreDisplay
                  score={displayResult.score}
                  isStreaming={isStreaming}
                />
              ) : (
                isStreaming && <ScoreSkeleton />
              )}
              {displayResult?.summary ? (
                <p className="flex-1 text-sm text-foreground/80">
                  {displayResult.summary}
                  {isStreaming && (
                    <span className="inline-flex ml-1">
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

            {/* Suggestions - show as they come in */}
            {suggestions.length > 0 && (
              <SuggestionsList
                suggestions={suggestions}
                skeletonCount={missingSuggestionCount}
                isStreaming={isStreaming}
              />
            )}
            {isStreaming && suggestions.length === 0 && <SuggestionsSkeleton />}

            {/* Disclaimer - show only when we have any content */}
            {!isLoading && (
              <p className="mt-4 text-xs text-muted-foreground/70 leading-relaxed">
                本评审结果为自动化结构分析与规则校验，仅用于技术参考，不构成质量结论、审计意见或设计否定，请结合实际业务语境自行判断。
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
);
