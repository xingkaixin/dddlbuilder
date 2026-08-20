import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Clock,
  Loader2,
} from '@/components/icons';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TableVersion } from '@/utils/savedTablesDb';
import type { FieldRow } from '@ddlbuilder/shared-types';
import type { TableDiff, FieldDiff, FieldChangeType } from '@ddlbuilder/ddl-core';
import { diffPersistedState } from '@ddlbuilder/ddl-core';
import { listVersions } from '@/utils/tableVersions';
import { useTranslation } from 'react-i18next';
import { getDefaultKindLabel, getNullableLabel, getOnUpdateLabel } from '@/i18n/fieldEnums';
import { useLocale } from '@/i18n/LocaleContext';

interface SchemaTimelinePlayerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableNormalizedName: string | null;
  tableName: string | null;
}

type RowChangeStatus = 'added' | 'modified' | 'renamed' | 'unchanged';

type Speed = 0.5 | 1 | 2;

const SPEED_LABELS: Record<Speed, string> = {
  0.5: '0.5x',
  1: '1x',
  2: '2x',
};

const SPEED_INTERVAL_MS: Record<Speed, number> = {
  0.5: 2000,
  1: 1000,
  2: 500,
};

function formatDateTime(timestamp: number, locale: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeFieldRows(rows: FieldRow[] | undefined): FieldRow[] {
  if (!rows) return [];
  return rows.filter((r) => r.fieldName?.trim());
}

function getRowChangeStatus(fieldName: string, diff: TableDiff | null): RowChangeStatus {
  if (!diff) return 'unchanged';
  const fieldDiff = diff.fields.find((f) => f.fieldName === fieldName);
  if (!fieldDiff) return 'unchanged';
  if (fieldDiff.type === 'add') return 'added';
  if (fieldDiff.type === 'modify') return 'modified';
  if (fieldDiff.type === 'rename') return 'renamed';
  return 'unchanged';
}

function getFieldDiff(fieldName: string, diff: TableDiff | null): FieldDiff | undefined {
  if (!diff) return undefined;
  return diff.fields.find((f) => f.fieldName === fieldName);
}

function formatFieldChanges(
  changes: FieldChangeType[] | undefined,
  t: (key: string) => string,
): string {
  if (!changes || changes.length === 0) return '';
  const labels: Record<FieldChangeType, string> = {
    type: t('diffDialog.type'),
    nullable: t('diffDialog.nullable'),
    default: t('dataTable.headers.defaultKind'),
    comment: t('diffDialog.commentChanged'),
  };
  return changes.map((c) => labels[c] || c).join(', ');
}

function buildChangeSummary(
  diff: TableDiff | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!diff || !diff.hasChanges) return t('timelinePlayer.noChange');
  const parts: string[] = [];
  const addedFields = diff.fields.filter((f) => f.type === 'add').length;
  const removedFields = diff.fields.filter((f) => f.type === 'remove').length;
  const modifiedFields = diff.fields.filter((f) => f.type === 'modify').length;
  const renamedFields = diff.fields.filter((f) => f.type === 'rename').length;
  const addedIndexes = diff.indexes.filter((i) => i.type === 'add').length;
  const removedIndexes = diff.indexes.filter((i) => i.type === 'remove').length;

  if (addedFields > 0) parts.push(t('timelinePlayer.fieldAdded', { count: addedFields }));
  if (removedFields > 0) parts.push(t('timelinePlayer.fieldRemoved', { count: removedFields }));
  if (modifiedFields > 0) parts.push(t('timelinePlayer.fieldModified', { count: modifiedFields }));
  if (renamedFields > 0) parts.push(t('timelinePlayer.fieldModified', { count: renamedFields }));
  if (addedIndexes > 0) parts.push(t('timelinePlayer.indexAdded', { count: addedIndexes }));
  if (removedIndexes > 0) parts.push(t('timelinePlayer.indexRemoved', { count: removedIndexes }));
  if (diff.tableNameChanged) parts.push(t('timelinePlayer.tableNameChanged'));
  if (diff.tableCommentChanged) parts.push(t('timelinePlayer.tableCommentChanged'));
  if (diff.miscConfigChanged) parts.push(t('timelinePlayer.miscChanged'));

  return parts.join(' · ') || t('timelinePlayer.noChange');
}

export const SchemaTimelinePlayer = memo<SchemaTimelinePlayerProps>(
  ({ open, onOpenChange, tableNormalizedName, tableName }) => {
    const { t } = useTranslation();
    const { resolvedLocale } = useLocale();
    const [versions, setVersions] = useState<TableVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState<Speed>(1);

    // Load versions when dialog opens
    useEffect(() => {
      if (!open || !tableNormalizedName) {
        setVersions([]);
        setCurrentFrame(0);
        setIsPlaying(false);
        return;
      }
      setLoading(true);
      void listVersions(tableNormalizedName)
        .then((list) => {
          // Sort ascending (oldest first)
          const sorted = list.sort((a, b) => a.createdAt - b.createdAt);
          setVersions(sorted);
          setCurrentFrame(0);
        })
        .finally(() => setLoading(false));
    }, [open, tableNormalizedName]);

    // Precompute diffs for each frame
    const frameDiffs = useMemo<(TableDiff | null)[]>(() => {
      if (versions.length === 0) return [];
      const diffs: (TableDiff | null)[] = [null]; // first frame has no diff
      for (let i = 1; i < versions.length; i++) {
        diffs.push(diffPersistedState(versions[i - 1].state, versions[i].state));
      }
      return diffs;
    }, [versions]);

    // Auto-play timer
    useEffect(() => {
      if (!isPlaying || versions.length <= 1) return;
      const intervalMs = SPEED_INTERVAL_MS[speed];
      const timer = setInterval(() => {
        setCurrentFrame((prev) => {
          if (prev >= versions.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
      return () => clearInterval(timer);
    }, [isPlaying, speed, versions.length]);

    const handlePlayPause = useCallback(() => {
      setIsPlaying((prev) => !prev);
    }, []);

    const handlePrev = useCallback(() => {
      setIsPlaying(false);
      setCurrentFrame((prev) => Math.max(0, prev - 1));
    }, []);

    const handleNext = useCallback(() => {
      setIsPlaying(false);
      setCurrentFrame((prev) => Math.min(versions.length - 1, prev + 1));
    }, [versions.length]);

    const handleFirst = useCallback(() => {
      setIsPlaying(false);
      setCurrentFrame(0);
    }, []);

    const handleLast = useCallback(() => {
      setIsPlaying(false);
      setCurrentFrame(versions.length - 1);
    }, [versions.length]);

    const handleSpeedChange = useCallback(() => {
      setSpeed((prev) => (prev === 0.5 ? 1 : prev === 1 ? 2 : 0.5));
    }, []);

    const handleProgressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setIsPlaying(false);
      const value = parseInt(e.target.value, 10);
      setCurrentFrame(value);
    }, []);

    const currentVersion = versions[currentFrame];
    const currentDiff = frameDiffs[currentFrame];
    const currentFields = useMemo(
      () => normalizeFieldRows(currentVersion?.state.rows),
      [currentVersion],
    );
    const changeSummary = useMemo(() => buildChangeSummary(currentDiff, t), [currentDiff, t]);

    const tableMetaChanges = useMemo(() => {
      if (!currentDiff) return [];
      const changes: string[] = [];
      if (currentDiff.tableNameChanged && currentDiff.oldTableName && currentDiff.newTableName) {
        changes.push(
          `${t('diffDialog.tableName')}: ${currentDiff.oldTableName} → ${currentDiff.newTableName}`,
        );
      }
      if (currentDiff.tableCommentChanged) {
        changes.push(t('timelinePlayer.tableCommentChanged'));
      }
      if (currentDiff.miscConfigChanged) {
        changes.push(t('timelinePlayer.miscChanged'));
      }
      return changes;
    }, [currentDiff, t]);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>
              {tableName
                ? t('timelinePlayer.titleWithName', { name: tableName })
                : t('timelinePlayer.title')}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t('timelinePlayer.loading')}
              </span>
            </div>
          ) : versions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t('timelinePlayer.empty')}
            </div>
          ) : (
            <>
              {/* Mini timeline */}
              <div className="shrink-0 border-b px-6 py-3">
                <div className="flex items-center gap-1">
                  {versions.map((v, idx) => {
                    const isActive = idx === currentFrame;
                    const hasChanges = frameDiffs[idx]?.hasChanges ?? false;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setIsPlaying(false);
                          setCurrentFrame(idx);
                        }}
                        className={cn(
                          'relative flex flex-1 flex-col items-center gap-1 rounded px-1 py-1.5 transition-colors',
                          isActive ? 'bg-primary/10' : 'hover:bg-muted',
                        )}
                      >
                        <div
                          className={cn(
                            'h-2.5 w-2.5 rounded-full border-2',
                            isActive
                              ? 'border-primary bg-primary'
                              : hasChanges
                                ? 'border-amber-500 bg-amber-500'
                                : 'border-muted-foreground/30 bg-background',
                          )}
                        />
                        <span
                          className={cn(
                            'text-[10px]',
                            isActive ? 'font-medium text-primary' : 'text-muted-foreground',
                          )}
                        >
                          v{idx + 1}
                        </span>
                        {idx < versions.length - 1 && (
                          <div className="absolute right-0 top-3 h-px w-1/2 bg-border" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Frame info */}
              <div className="shrink-0 border-b bg-muted/30 px-6 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-medium">
                      {t('timelinePlayer.frameInfo', {
                        current: currentFrame + 1,
                        total: versions.length,
                      })}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {currentVersion
                        ? formatDateTime(currentVersion.createdAt, resolvedLocale)
                        : ''}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{changeSummary}</div>
                </div>
                {tableMetaChanges.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {tableMetaChanges.map((change, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
                      >
                        {change}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Read-only field table */}
              <div className="min-h-0 flex-1 overflow-auto px-6 py-3">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-2 py-2 font-medium">{t('timelinePlayer.headers.order')}</th>
                      <th className="px-2 py-2 font-medium">
                        {t('timelinePlayer.headers.fieldName')}
                      </th>
                      <th className="px-2 py-2 font-medium">
                        {t('timelinePlayer.headers.fieldType')}
                      </th>
                      <th className="px-2 py-2 font-medium">
                        {t('timelinePlayer.headers.fieldComment')}
                      </th>
                      <th className="px-2 py-2 font-medium">
                        {t('timelinePlayer.headers.nullable')}
                      </th>
                      <th className="px-2 py-2 font-medium">
                        {t('timelinePlayer.headers.defaultKind')}
                      </th>
                      <th className="px-2 py-2 font-medium">
                        {t('timelinePlayer.headers.defaultValue')}
                      </th>
                      <th className="px-2 py-2 font-medium">
                        {t('timelinePlayer.headers.onUpdate')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentFields.map((row, idx) => {
                      const status = getRowChangeStatus(row.fieldName || '', currentDiff);
                      const fieldDiff = getFieldDiff(row.fieldName || '', currentDiff);
                      const changeLabel =
                        status === 'modified' || status === 'renamed'
                          ? formatFieldChanges(fieldDiff?.changes, t)
                          : '';

                      return (
                        <tr
                          key={`${idx}-${row.fieldName}`}
                          className={cn(
                            'border-b transition-colors',
                            status === 'added' && 'bg-green-500/10',
                            (status === 'modified' || status === 'renamed') && 'bg-amber-500/10',
                          )}
                        >
                          <td className="px-2 py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{row.fieldName}</span>
                              {status === 'added' && (
                                <span className="rounded bg-green-500/15 px-1 py-0 text-[10px] text-green-700 dark:text-green-400">
                                  +{t('diffDialog.fieldChanges', { count: 1 }).replace('1', '')}
                                </span>
                              )}
                              {status === 'renamed' && fieldDiff?.oldFieldName && (
                                <span className="rounded bg-amber-500/15 px-1 py-0 text-[10px] text-amber-700 dark:text-amber-400">
                                  {fieldDiff.oldFieldName} →
                                </span>
                              )}
                              {changeLabel && (
                                <span className="rounded bg-amber-500/15 px-1 py-0 text-[10px] text-amber-700 dark:text-amber-400">
                                  {changeLabel}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">{row.fieldType}</td>
                          <td className="px-2 py-2 text-muted-foreground">{row.fieldComment}</td>
                          <td className="px-2 py-2">{getNullableLabel(row.nullable, t)}</td>
                          <td className="px-2 py-2">{getDefaultKindLabel(row.defaultKind, t)}</td>
                          <td className="px-2 py-2">{row.defaultValue}</td>
                          <td className="px-2 py-2">{getOnUpdateLabel(row.onUpdate, t)}</td>
                        </tr>
                      );
                    })}
                    {currentFields.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                          {t('timelinePlayer.empty')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Playback controls */}
              <div className="shrink-0 border-t bg-muted/30 px-6 py-3">
                {/* Progress bar */}
                <div className="mb-3">
                  <input
                    type="range"
                    min={0}
                    max={versions.length - 1}
                    value={currentFrame}
                    onChange={handleProgressChange}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleFirst}
                      title={t('timelinePlayer.first')}
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handlePrev}
                      title={t('timelinePlayer.prev')}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="default"
                      size="icon"
                      className="h-9 w-9"
                      onClick={handlePlayPause}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleNext}
                      title={t('timelinePlayer.next')}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleLast}
                      title={t('timelinePlayer.last')}
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleSpeedChange}
                  >
                    {t('timelinePlayer.speed')}: {SPEED_LABELS[speed]}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  },
);

SchemaTimelinePlayer.displayName = 'SchemaTimelinePlayer';
