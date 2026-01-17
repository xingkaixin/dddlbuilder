import { memo } from 'react';
import { Star, Lightbulb, AlertCircle, Loader2 } from 'lucide-react';
import type { ReviewResult } from '@/hooks/useDDLReview';

interface ReviewResultPanelProps {
  isLoading: boolean;
  streamingText: string;
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

export const ReviewResultPanel = memo<ReviewResultPanelProps>(
  ({ isLoading, streamingText, result, error }) => {
    if (!isLoading && !result && !error && !streamingText) {
      return null;
    }

    return (
      <div className="mt-4 rounded-lg border border-primary/10 bg-card/50 p-4">
        {isLoading && (
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

        {error && (
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Score */}
            <div className="flex items-center gap-4">
              <div
                className={`flex items-center gap-2 rounded-lg px-4 py-2 ${getScoreBgColor(result.score)}`}
              >
                <Star
                  className={`h-5 w-5 ${getScoreColor(result.score)}`}
                  fill="currentColor"
                />
                <span
                  className={`text-2xl font-bold ${getScoreColor(result.score)}`}
                >
                  {result.score}
                </span>
                <span className="text-sm text-muted-foreground">/10</span>
              </div>
              <p className="flex-1 text-sm text-foreground/80">
                {result.summary}
              </p>
            </div>

            {/* Suggestions */}
            {result.suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Lightbulb className="h-4 w-4" />
                  <span>改进建议</span>
                </div>
                <ul className="space-y-1.5 pl-6">
                  {result.suggestions.map((suggestion, index) => (
                    <li
                      key={index}
                      className="text-sm text-foreground/70 list-disc"
                    >
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);
