import { memo, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  AIIndexAdvisorRecommendation,
  AIIndexAdvisorRecommendationCategory,
  AIIndexAdvisorResult,
} from '@ddlbuilder/shared-types';
import { ListChecks, Loader2, Sparkles } from '@/components/icons';
import { useTranslation } from 'react-i18next';

interface AIIndexAdvisorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  result: AIIndexAdvisorResult | null;
  error: string | null;
  suggestedQuery: string;
  blockingMessage: string | null;
  onAnalyze: (queryPatterns: string) => void;
  onApplyIndex: (recommendation: AIIndexAdvisorRecommendation) => void;
}

const CATEGORY_BADGE_CLASS: Record<AIIndexAdvisorRecommendationCategory, string> = {
  missing_index: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  redundant_index: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
  order_optimization: 'border-sky-500/30 bg-sky-500/10 text-sky-700',
  query_rewrite: 'border-violet-500/30 bg-violet-500/10 text-violet-700',
  general: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

export const AIIndexAdvisorDialog = memo<AIIndexAdvisorDialogProps>(
  ({
    open,
    onOpenChange,
    isLoading,
    result,
    error,
    suggestedQuery,
    blockingMessage,
    onAnalyze,
    onApplyIndex,
  }) => {
    const { t } = useTranslation();
    const [queryPatterns, setQueryPatterns] = useState('');

    useEffect(() => {
      if (!open) return;
      setQueryPatterns(suggestedQuery);
    }, [open, suggestedQuery]);

    const canAnalyze = queryPatterns.trim().length > 0 && !isLoading && !blockingMessage;
    const recommendations = useMemo(() => result?.recommendations ?? [], [result]);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[86vh] w-[min(760px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('aiIndexAdvisor.title')}
            </DialogTitle>
            <DialogDescription>{t('aiIndexAdvisor.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="ai-index-query-patterns">{t('aiIndexAdvisor.queryLabel')}</Label>
              {blockingMessage && (
                <div
                  className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                  role="alert"
                >
                  {blockingMessage}
                </div>
              )}
              <Textarea
                id="ai-index-query-patterns"
                value={queryPatterns}
                onChange={(event) => setQueryPatterns(event.target.value)}
                placeholder={t('aiIndexAdvisor.placeholder')}
                disabled={Boolean(blockingMessage)}
                className="min-h-36 resize-y font-mono text-xs"
              />
              {error && (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>

            {result && (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  {result.summary || t('aiIndexAdvisor.summaryFallback')}
                </div>

                {recommendations.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {t('aiIndexAdvisor.empty')}
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {recommendations.map((recommendation) => (
                      <div key={recommendation.id} className="rounded-md border bg-card p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'rounded-md px-1.5 py-0 text-[11px]',
                                  CATEGORY_BADGE_CLASS[recommendation.category],
                                )}
                              >
                                {t(`aiIndexAdvisor.category.${recommendation.category}`)}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="rounded-md px-1.5 py-0 text-[11px]"
                              >
                                {t(`aiIndexAdvisor.confidence.${recommendation.confidence}`)}
                              </Badge>
                            </div>
                            <h3 className="text-sm font-semibold">{recommendation.title}</h3>
                          </div>
                          {recommendation.index && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 px-2 text-xs"
                              onClick={() => onApplyIndex(recommendation)}
                            >
                              <ListChecks className="h-3.5 w-3.5" />
                              {t('aiIndexAdvisor.applyIndex')}
                            </Button>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {recommendation.rationale}
                        </p>
                        {recommendation.index && (
                          <div className="mt-2 rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                            {recommendation.index.name}:{' '}
                            {recommendation.index.fields
                              .map((field) => `${field.name} ${field.direction}`)
                              .join(', ')}
                          </div>
                        )}
                        {recommendation.targetIndexName && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t('aiIndexAdvisor.targetIndex', {
                              name: recommendation.targetIndexName,
                            })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('dialogs.save.cancel')}
            </Button>
            <Button onClick={() => onAnalyze(queryPatterns)} disabled={!canAnalyze}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? t('aiIndexAdvisor.running') : t('aiIndexAdvisor.analyze')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);

AIIndexAdvisorDialog.displayName = 'AIIndexAdvisorDialog';
