import { memo, useCallback, useEffect, useState } from 'react';
import { History, Trash2, Loader2, Star, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { ReviewRecordMetadata, ReviewRecord } from '@/utils/reviewHistory';
import { listReviewMetadata, getReview, deleteReview } from '@/utils/reviewHistory';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/LocaleContext';

interface ReviewHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableNormalizedName: string | null;
}

function formatDate(
  timestamp: number,
  locale: string,
  todayLabel: (time: string) => string,
): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) {
    return todayLabel(time);
  }

  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-green-600';
  if (score >= 6) return 'text-yellow-600';
  return 'text-red-600';
}

export const ReviewHistoryDialog = memo<ReviewHistoryDialogProps>(
  ({ open, onOpenChange, tableNormalizedName }) => {
    const { t } = useTranslation();
    const { resolvedLocale } = useLocale();
    const { showToast } = useToast();
    const [reviews, setReviews] = useState<ReviewRecordMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedDetail, setExpandedDetail] = useState<ReviewRecord | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // 加载评审列表
    const loadReviews = useCallback(async () => {
      setLoading(true);
      try {
        const list = await listReviewMetadata(tableNormalizedName || undefined);
        setReviews(list);
      } finally {
        setLoading(false);
      }
    }, [tableNormalizedName]);

    useEffect(() => {
      if (open) {
        void loadReviews();
      } else {
        setReviews([]);
        setExpandedId(null);
        setExpandedDetail(null);
      }
    }, [open, loadReviews]);

    // 展开/折叠详情
    const handleToggleExpand = useCallback(
      async (id: string) => {
        if (expandedId === id) {
          setExpandedId(null);
          setExpandedDetail(null);
        } else {
          setExpandedId(id);
          const detail = await getReview(id);
          setExpandedDetail(detail);
        }
      },
      [expandedId],
    );

    // 删除记录
    const handleDelete = useCallback(async () => {
      if (!deleteConfirmId) return;
      setActionLoading(true);
      try {
        await deleteReview(deleteConfirmId);
        setDeleteConfirmId(null);
        await loadReviews();
        showToast(t('reviewHistory.deleteSuccess'));
      } catch {
        showToast(t('reviewHistory.deleteFailed'));
      } finally {
        setActionLoading(false);
      }
    }, [deleteConfirmId, loadReviews, showToast, t]);

    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                {t('reviewHistory.title')}
              </DialogTitle>
              <DialogDescription>{t('reviewHistory.description')}</DialogDescription>
            </DialogHeader>

            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : reviews.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t('reviewHistory.empty')}
                </div>
              ) : (
                reviews.map((r) => (
                  <div
                    key={r.id}
                    className="group rounded-lg border bg-muted/30 transition-colors hover:bg-muted/50"
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => handleToggleExpand(r.id)}
                        className="flex w-full cursor-pointer items-start gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Star className={cn('h-4 w-4', getScoreColor(r.score))} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={cn('text-lg font-semibold', getScoreColor(r.score))}>
                              {r.score}/10
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(r.createdAt, resolvedLocale, (time) =>
                                t('reviewHistory.today', {
                                  time,
                                }),
                              )}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                            {r.tableName} · {r.dbType.toUpperCase()}
                          </span>
                          <span className="mt-1 line-clamp-2 block text-xs text-foreground/80">
                            {r.summary}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 pr-8">
                          {expandedId === r.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                      </button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-3 top-3 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(r.id);
                        }}
                        aria-label={t('reviewHistory.deleteAria', {
                          tableName: r.tableName,
                        })}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>

                    {expandedId === r.id && expandedDetail && (
                      <div className="border-t px-3 py-2">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          {t('reviewHistory.suggestionTitle')}
                        </p>
                        {expandedDetail.result.suggestions.length > 0 ? (
                          <ul className="space-y-1 text-xs">
                            {expandedDetail.result.suggestions.map((s, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                                <span>{typeof s === 'string' ? s : s.description}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {t('reviewHistory.noSuggestion')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={!!deleteConfirmId}
          onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('reviewHistory.deleteConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('reviewHistory.deleteConfirmDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('dialogs.delete.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={actionLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('dialogs.delete.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);
ReviewHistoryDialog.displayName = 'ReviewHistoryDialog';
