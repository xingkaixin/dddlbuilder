import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { History, RotateCcw, GitCompare, Trash2, Loader2, Play } from 'lucide-react';
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
import type { TableVersion } from '@/utils/savedTablesDb';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { TableDiff } from '@ddlbuilder/ddl-core';
import { diffPersistedState } from '@ddlbuilder/ddl-core';
import {
  listVersions,
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
  onPlayTimeline?: () => void;
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

function buildDiffSummary(diff: TableDiff | null): string {
  if (!diff || !diff.hasChanges) return '';
  const parts: string[] = [];
  const addedFields = diff.fields.filter((f) => f.type === 'add').length;
  const removedFields = diff.fields.filter((f) => f.type === 'remove').length;
  const modifiedFields = diff.fields.filter(
    (f) => f.type === 'modify' || f.type === 'rename',
  ).length;
  const addedIndexes = diff.indexes.filter((i) => i.type === 'add').length;
  const removedIndexes = diff.indexes.filter((i) => i.type === 'remove').length;

  if (addedFields > 0) parts.push(`+${addedFields} 字段`);
  if (removedFields > 0) parts.push(`-${removedFields} 字段`);
  if (modifiedFields > 0) parts.push(`~${modifiedFields} 字段`);
  if (addedIndexes > 0) parts.push(`+${addedIndexes} 索引`);
  if (removedIndexes > 0) parts.push(`-${removedIndexes} 索引`);
  if (diff.tableNameChanged) parts.push('表名变更');
  if (diff.tableCommentChanged) parts.push('注释变更');
  if (diff.miscConfigChanged) parts.push('杂项变更');

  return parts.join(', ');
}

export const VersionHistoryDialog = memo<VersionHistoryDialogProps>(
  ({
    open,
    onOpenChange,
    tableNormalizedName,
    tableName,
    onRollback,
    onCompare,
    onPlayTimeline,
    currentState,
  }) => {
    const { t } = useTranslation();
    const { resolvedLocale } = useLocale();
    const { showToast } = useToast();
    const [versions, setVersions] = useState<TableVersion[]>([]);
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

    // 加载版本列表（完整版本，用于计算 diff）
    const loadVersions = useCallback(async () => {
      if (!tableNormalizedName) return;
      setLoading(true);
      try {
        const list = await listVersions(tableNormalizedName);
        // listVersions 返回倒序，保持倒序（最新在前）用于时间轴展示
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

    // 预计算相邻版本之间的 diff（时间轴上每个节点 vs 它的下一个/更老的版本）
    const versionDiffs = useMemo(() => {
      const diffs: (TableDiff | null)[] = [];
      for (let i = 0; i < versions.length; i++) {
        if (i < versions.length - 1) {
          diffs.push(diffPersistedState(versions[i + 1].state, versions[i].state));
        } else {
          diffs.push(null);
        }
      }
      return diffs;
    }, [versions]);

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

            <div className="flex max-h-[50vh] flex-col overflow-y-auto overscroll-contain pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : versions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t('versionHistory.empty')}
                </div>
              ) : (
                <div className="relative pl-4">
                  {/* 时间轴线 */}
                  <div className="absolute bottom-3 left-[11px] top-3 w-px bg-border" />

                  {versions.map((v, index) => {
                    const isSelected = selectedId === v.id;
                    const isLatest = index === 0;
                    const isInitial = index === versions.length - 1;
                    const diff = versionDiffs[index];
                    const diffSummary = buildDiffSummary(diff);

                    return (
                      <div key={v.id} className="group relative mb-1">
                        {/* 时间节点圆点 */}
                        <div
                          className={cn(
                            'absolute left-0 top-3 z-10 h-2.5 w-2.5 rounded-full border-2',
                            isSelected
                              ? 'border-primary bg-primary'
                              : isLatest
                                ? 'border-green-500 bg-green-500'
                                : 'border-muted-foreground/40 bg-background',
                          )}
                        />

                        <button
                          type="button"
                          onClick={() => setSelectedId(v.id)}
                          className={cn(
                            'ml-5 flex w-full flex-col gap-1 rounded-lg border p-3 pr-10 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-transparent bg-muted/30 hover:bg-muted/50',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              v{versions.length - index}
                              {isLatest && (
                                <span className="ml-1.5 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600">
                                  {t('versionHistory.latest')}
                                </span>
                              )}
                              {isInitial && (
                                <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {t('versionHistory.initialVersion')}
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(v.createdAt, resolvedLocale, (time) =>
                                t('reviewHistory.today', { time }),
                              )}
                            </span>
                          </div>

                          {resolveVersionMessage(v.message) && (
                            <p className="truncate text-xs text-muted-foreground">
                              {resolveVersionMessage(v.message)}
                            </p>
                          )}

                          <p className="text-xs text-muted-foreground">
                            {v.state.rows?.filter((r) => r.fieldName?.trim()).length || 0}{' '}
                            {t('versionHistory.fieldCount', {
                              count: v.state.rows?.filter((r) => r.fieldName?.trim()).length || 0,
                            }).replace(/\d+\s*/, '')}{' '}
                            · {v.state.dbType.toUpperCase()}
                          </p>

                          {diffSummary && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              {diffSummary}
                            </p>
                          )}
                        </button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-2 h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
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
                    );
                  })}
                </div>
              )}
            </div>

            {versions.length > 0 && (
              <div className="flex items-center justify-end gap-2 border-t pt-3">
                {onPlayTimeline && versions.length >= 2 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => {
                      onOpenChange(false);
                      onPlayTimeline();
                    }}
                    className="h-7 gap-1.5 px-2 text-xs font-medium"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {t('versionHistory.playTimeline')}
                  </Button>
                )}
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
                {t('versionHistory.deleteConfirmAction')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);
VersionHistoryDialog.displayName = 'VersionHistoryDialog';
