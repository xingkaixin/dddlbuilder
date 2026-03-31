import { memo, useCallback, useEffect, useState } from 'react';
import { History, RotateCcw, GitCompare, Trash2, Loader2 } from 'lucide-react';
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
import type { TableVersionMetadata } from '@/utils/savedTablesDb';
import type { PersistedState } from '@/types';
import {
  listVersionMetadata,
  getVersion,
  deleteVersion,
  INITIAL_VERSION_MESSAGE_KEY,
} from '@/utils/tableVersions';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/LocaleContext';

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableNormalizedName: string | null;
  tableName: string | null;
  onRollback?: (state: PersistedState) => void;
  onCompare?: (oldState: PersistedState, newState: PersistedState) => void;
  currentState?: PersistedState | null;
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

export const VersionHistoryDialog = memo<VersionHistoryDialogProps>(
  ({ open, onOpenChange, tableNormalizedName, tableName, onRollback, onCompare, currentState }) => {
    const { t } = useTranslation();
    const { resolvedLocale } = useLocale();
    const { showToast } = useToast();
    const [versions, setVersions] = useState<TableVersionMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const resolveVersionMessage = useCallback(
      (message?: string | null) => {
        if (!message) return '';
        if (
          message === INITIAL_VERSION_MESSAGE_KEY ||
          message === '初始版本' ||
          message === 'Initial version'
        ) {
          return t('versionHistory.initialVersion');
        }
        return message;
      },
      [t],
    );

    // 加载版本列表
    const loadVersions = useCallback(async () => {
      if (!tableNormalizedName) return;
      setLoading(true);
      try {
        const list = await listVersionMetadata(tableNormalizedName);
        setVersions(list);
        if (list.length > 0 && !selectedId) {
          setSelectedId(list[0].id);
        }
      } finally {
        setLoading(false);
      }
    }, [tableNormalizedName, selectedId]);

    useEffect(() => {
      if (open && tableNormalizedName) {
        void loadVersions();
      } else {
        setVersions([]);
        setSelectedId(null);
      }
    }, [open, tableNormalizedName, loadVersions]);

    // 回滚到选中版本
    const handleRollback = useCallback(async () => {
      if (!selectedId || !onRollback) return;
      setActionLoading(true);
      try {
        const version = await getVersion(selectedId);
        if (version) {
          onRollback(version.state);
          onOpenChange(false);
        }
      } finally {
        setActionLoading(false);
      }
    }, [selectedId, onRollback, onOpenChange]);

    // 与当前版本对比
    const handleCompare = useCallback(async () => {
      if (!selectedId || !onCompare || !currentState) return;
      setActionLoading(true);
      try {
        const version = await getVersion(selectedId);
        if (version) {
          onCompare(version.state, currentState);
        }
      } finally {
        setActionLoading(false);
      }
    }, [selectedId, onCompare, currentState]);

    // 删除版本
    const handleDelete = useCallback(async () => {
      if (!deleteConfirmId) return;
      setActionLoading(true);
      try {
        await deleteVersion(deleteConfirmId);
        setDeleteConfirmId(null);
        await loadVersions();
        showToast(t('versionHistory.deleteSuccess'));
      } catch {
        showToast(t('versionHistory.deleteFailed'));
      } finally {
        setActionLoading(false);
      }
    }, [deleteConfirmId, loadVersions, showToast, t]);

    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                {t('versionHistory.title')}
              </DialogTitle>
              <DialogDescription>
                {tableName
                  ? t('versionHistory.descriptionWithName', { name: tableName })
                  : t('versionHistory.descriptionFallback')}
              </DialogDescription>
            </DialogHeader>

            <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : versions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t('versionHistory.empty')}
                </div>
              ) : (
                versions.map((v, index) => (
                  <div key={v.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg border p-3 pr-12 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        selectedId === v.id
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent bg-muted/30 hover:bg-muted/50',
                      )}
                    >
                      <div
                        className={cn(
                          'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                          index === 0 ? 'bg-green-500' : 'bg-muted-foreground/30',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">v{versions.length - index}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(v.createdAt, resolvedLocale, (time) =>
                              t('reviewHistory.today', {
                                time,
                              }),
                            )}
                          </span>
                          {index === 0 && (
                            <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-600">
                              {t('versionHistory.latest')}
                            </span>
                          )}
                        </div>
                        {resolveVersionMessage(v.message) && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {resolveVersionMessage(v.message)}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('versionHistory.fieldCount', {
                            count: v.fieldCount,
                          })}{' '}
                          · {v.dbType.toUpperCase()}
                        </p>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-3 top-3 h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(v.id);
                      }}
                      aria-label={t('versionHistory.deleteAria', {
                        version: versions.length - index,
                      })}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {versions.length > 0 && (
              <div className="flex items-center justify-end gap-2 border-t pt-3">
                {onCompare && currentState && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!selectedId || actionLoading}
                    onClick={handleCompare}
                    className="h-7 gap-1.5 px-2 text-xs font-medium"
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    {t('versionHistory.compare')}
                  </Button>
                )}
                {onRollback && (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={!selectedId || actionLoading}
                    onClick={handleRollback}
                    className="h-7 gap-1.5 px-2 text-xs font-medium"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('versionHistory.rollback')}
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={!!deleteConfirmId}
          onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('versionHistory.deleteConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('versionHistory.deleteConfirmDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('dialogs.delete.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
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
VersionHistoryDialog.displayName = 'VersionHistoryDialog';
