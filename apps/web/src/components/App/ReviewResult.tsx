import { memo } from 'react';
import {
  Star,
  Lightbulb,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Check,
  Plus,
  ArrowRight,
  Minus,
} from 'lucide-react';
import type { ReviewResult, StructuredSuggestion } from '@/hooks/useDDLReview';
import type { PartialReviewResult } from '@/utils/parsePartialJson';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

// Known suggestion types for compatibility
const KNOWN_SUGGESTION_TYPES = new Set([
  'add_field',
  'modify_field',
  'remove_field',
  'add_index',
  'remove_index',
  'performance_warning',
  'general',
]);

interface ReviewResultPanelProps {
  isLoading: boolean;
  partialResult: PartialReviewResult | null;
  result: ReviewResult | null;
  error: string | null;
  onApplySuggestion?: (suggestion: StructuredSuggestion) => void;
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

function isRenderableSuggestion(
  suggestion: string | Record<string, unknown> | StructuredSuggestion,
): suggestion is string | StructuredSuggestion {
  if (typeof suggestion === 'string') return true;
  return (
    typeof suggestion.id === 'string' &&
    typeof suggestion.description === 'string' &&
    typeof suggestion.type === 'string' &&
    typeof suggestion.actionable === 'boolean'
  );
}

// Component for rendering score
function ScoreDisplay({ score, isStreaming }: { score: number; isStreaming?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-4 py-2 ${getScoreBgColor(score)}`}>
      <Star className={`h-5 w-5 ${getScoreColor(score)}`} fill="currentColor" />
      <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</span>
      <span className="text-sm text-muted-foreground">/10</span>
      {isStreaming && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
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

// Component for rendering a single suggestion
const SuggestionItem = memo<{
  suggestion: string | StructuredSuggestion;
  onApply?: (suggestion: StructuredSuggestion) => void;
  isStreaming?: boolean;
}>(({ suggestion, onApply, isStreaming }) => {
  const { t } = useTranslation();
  if (typeof suggestion === 'string') {
    return <li className="text-sm text-foreground/70 list-disc relative pl-1">{suggestion}</li>;
  }

  // Guard check: ensure required properties exist (for partial objects during streaming)
  if (!suggestion.id || !suggestion.description) {
    return null;
  }

  const isApplied = suggestion.applied;
  // Disable apply button during streaming to prevent state inconsistency
  // performance_warning and general suggestions cannot be auto-applied
  const isActionable =
    suggestion.actionable &&
    !isApplied &&
    !isStreaming &&
    suggestion.type !== 'performance_warning' &&
    suggestion.type !== 'general';

  // Normalize type for compatibility - fallback unknown types to 'general'
  const normalizedType = KNOWN_SUGGESTION_TYPES.has(suggestion.type) ? suggestion.type : 'general';

  return (
    <li className="group flex items-start gap-3 rounded-md border border-transparent p-2 transition-all hover:bg-muted/50 hover:border-border">
      <div className="mt-1 flex-shrink-0">
        {suggestion.applied ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : normalizedType === 'remove_field' || normalizedType === 'remove_index' ? (
          <Minus className="h-4 w-4 text-red-400" />
        ) : normalizedType === 'add_field' || normalizedType === 'add_index' ? (
          <Plus className="h-4 w-4 text-emerald-400" />
        ) : normalizedType === 'modify_field' ? (
          <ArrowRight className="h-4 w-4 text-amber-400" />
        ) : normalizedType === 'performance_warning' ? (
          <AlertTriangle
            className={`h-4 w-4 ${suggestion.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}
          />
        ) : (
          <Lightbulb className="h-4 w-4 text-blue-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground/80 leading-relaxed font-medium">
          {suggestion.description}
        </div>

        {/* Performance warning severity badge */}
        {normalizedType === 'performance_warning' && suggestion.severity && (
          <span
            className={`mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${
              suggestion.severity === 'error'
                ? 'text-red-600 bg-red-50 border border-red-100'
                : 'text-amber-600 bg-amber-50 border border-amber-100'
            }`}
          >
            {suggestion.severity === 'error' ? t('review.severe') : t('review.warning')}
          </span>
        )}

        {/* Detail view based on type */}
        {!isApplied && normalizedType === 'modify_field' && suggestion.fieldModification && (
          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
            <span className="font-mono bg-muted px-1 rounded truncate max-w-[100px]">
              {suggestion.fieldModification.fieldName}
            </span>
            <ArrowRight className="h-3 w-3" />
            <span className="text-amber-600 font-medium">
              {suggestion.fieldModification.changes?.fieldType ||
                suggestion.fieldModification.changes?.fieldComment ||
                (suggestion.fieldModification as any).fieldType ||
                (suggestion.fieldModification as any).fieldComment ||
                t('review.details')}
            </span>
          </div>
        )}

        {!isApplied && normalizedType === 'add_field' && suggestion.field && (
          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
            <span className="text-emerald-600 font-medium px-1 rounded bg-emerald-50 border border-emerald-100">
              + {suggestion.field.fieldName} ({suggestion.field.fieldType})
            </span>
          </div>
        )}

        {!isApplied && normalizedType === 'add_index' && suggestion.index && (
          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
            <span className="text-emerald-600 font-medium px-1 rounded bg-emerald-50 border border-emerald-100">
              + INDEX {suggestion.index.name}
            </span>
          </div>
        )}

        {!isApplied && normalizedType === 'remove_index' && suggestion.indexName && (
          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
            <span className="text-red-600 font-medium px-1 rounded bg-red-50 border border-red-100">
              - INDEX {suggestion.indexName}
            </span>
          </div>
        )}
      </div>

      {isActionable && onApply && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs gap-1 opacity-60 group-hover:opacity-100 transition-opacity bg-background"
          onClick={() => onApply(suggestion)}
        >
          {t('review.apply')}
        </Button>
      )}

      {isApplied && (
        <span className="text-[10px] font-medium text-emerald-500 bg-emerald-50 px-1 rounded border border-emerald-100">
          {t('review.applied')}
        </span>
      )}
    </li>
  );
});
SuggestionItem.displayName = 'SuggestionItem';

// Component for rendering suggestions list
function SuggestionsList({
  suggestions,
  skeletonCount = 0,
  isStreaming,
  onApply,
}: {
  suggestions: (string | StructuredSuggestion)[];
  skeletonCount?: number;
  isStreaming?: boolean;
  onApply?: (suggestion: StructuredSuggestion) => void;
}) {
  const { t } = useTranslation();
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Lightbulb className="h-4 w-4" />
        <span>{t('review.details')}</span>
        {isStreaming && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <ul className="space-y-1">
        {suggestions.map((suggestion, index) => (
          <SuggestionItem
            key={typeof suggestion === 'string' ? index : suggestion.id || index}
            suggestion={suggestion}
            onApply={onApply}
            isStreaming={isStreaming}
          />
        ))}
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <li key={`suggestion-skeleton-${index}`} className="flex items-start gap-3 p-2">
            <div className="mt-1 h-4 w-4 rounded-full bg-muted/50 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 w-11/12 rounded bg-muted/70 animate-pulse" />
              <div className="h-2 w-1/3 rounded bg-muted/50 animate-pulse" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SuggestionsSkeleton({ count = SUGGESTION_SKELETON_COUNT, showHeader = false }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
          <span>{t('review.generatingSuggestions')}</span>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      )}
      <ul className="space-y-1">
        {Array.from({ length: count }).map((_, index) => (
          <li key={`suggestion-skeleton-${index}`} className="flex items-start gap-3 p-2">
            <div className="mt-1 h-4 w-4 rounded-full bg-muted/50 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 w-11/12 rounded bg-muted/70 animate-pulse" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const ReviewResultPanel = memo<ReviewResultPanelProps>(
  ({ isLoading, partialResult, result, error, onApplySuggestion }) => {
    const { t } = useTranslation();
    const isStreaming = isLoading && !result;
    // Determine what to show: final result or partial result during streaming
    const displayResult = result || (isLoading ? partialResult : null);
    const suggestions = (displayResult?.suggestions ?? []).filter(isRenderableSuggestion);
    const missingSuggestionCount = isStreaming
      ? Math.max(1, SUGGESTION_SKELETON_COUNT - suggestions.length)
      : 0;

    if (!isLoading && !result && !error) {
      return null;
    }

    return (
      <div className="mt-4 rounded-lg border border-primary/10 bg-card/50 p-4 shadow-sm">
        {error && (
          <div className="flex items-center gap-2 text-red-500 mb-4 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {/* Progressive rendering of result */}
        {(displayResult || isStreaming) && (
          <div className="space-y-5">
            {/* Score & Summary */}
            <div className="flex items-start gap-4">
              {displayResult?.score !== undefined ? (
                <div className="shrink-0">
                  <ScoreDisplay score={displayResult.score} isStreaming={isStreaming} />
                </div>
              ) : (
                isStreaming && <ScoreSkeleton />
              )}
              {displayResult?.summary ? (
                <div className="flex-1 text-sm text-foreground/80 leading-relaxed py-1">
                  {displayResult.summary}
                  {isStreaming && (
                    <span className="inline-flex ml-1">
                      <span className="animate-pulse text-muted-foreground">...</span>
                    </span>
                  )}
                </div>
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
                onApply={onApplySuggestion}
              />
            )}
            {isStreaming && suggestions.length === 0 && <SuggestionsSkeleton showHeader />}

            {/* Disclaimer */}
            {!isLoading && (
              <p className="mt-4 text-[10px] text-muted-foreground/60 leading-relaxed border-t pt-3 italic">
                {t('review.disclaimer')}
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
);
