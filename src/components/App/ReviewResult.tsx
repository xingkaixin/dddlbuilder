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

// Shared component for rendering suggestions
function SuggestionsList({
  suggestions,
  isStreaming,
}: {
  suggestions: string[];
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
      </ul>
    </div>
  );
}

export const ReviewResultPanel = memo<ReviewResultPanelProps>(
  ({ isLoading, partialResult, result, error }) => {
    // Determine what to show: final result or partial result during streaming
    const displayResult = result || (isLoading ? partialResult : null);

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

        {/* Show loading state when no partial result yet */}
        {isLoading && !displayResult && (
          <div className="flex items-center gap-3 py-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              大师正在仔细审阅
              <span className="inline-flex w-6">
                <span className="animate-pulse">...</span>
              </span>
            </span>
          </div>
        )}

        {/* Progressive rendering of result */}
        {displayResult && (
          <div className="space-y-4">
            {/* Score - show as soon as it's available */}
            {displayResult.score !== undefined && (
              <div className="flex items-center gap-4">
                <ScoreDisplay
                  score={displayResult.score}
                  isStreaming={isLoading && !result}
                />
                {/* Summary - show with streaming indicator if loading */}
                {displayResult.summary ? (
                  <p className="flex-1 text-sm text-foreground/80">
                    {displayResult.summary}
                    {isLoading && !result && (
                      <span className="inline-flex ml-1">
                        <span className="animate-pulse text-muted-foreground">
                          ...
                        </span>
                      </span>
                    )}
                  </p>
                ) : (
                  isLoading && (
                    <p className="flex-1 text-sm text-muted-foreground animate-pulse">
                      正在生成总结...
                    </p>
                  )
                )}
              </div>
            )}

            {/* Show "waiting for score" only when loading with no score yet */}
            {isLoading &&
              displayResult.score === undefined &&
              (displayResult.summary || displayResult.suggestions) && (
                <div className="flex items-center gap-3 py-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">正在评分...</span>
                </div>
              )}

            {/* Suggestions - show as they come in */}
            {displayResult.suggestions &&
              displayResult.suggestions.length > 0 && (
                <SuggestionsList
                  suggestions={displayResult.suggestions}
                  isStreaming={isLoading && !result}
                />
              )}
          </div>
        )}
      </div>
    );
  },
);
