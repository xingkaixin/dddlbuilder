import { memo, useMemo, useCallback, useState, lazy, Suspense } from 'react';
import {
  Copy,
  Plus,
  Minus,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { TableDiff, FieldDiff, IndexDiff } from '@ddlbuilder/ddl-core';
import type { NormalizedField, DatabaseType } from '@ddlbuilder/shared-types';
import { generateAlterDDL, generateRollbackDDL } from '@/utils/alterDdlGenerator';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const SqlCodeBlock = lazy(() => import('./SqlCodeBlock'));

interface DiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  dbType: DatabaseType;
  diff: TableDiff | null;
  fields: NormalizedField[];
  onCopy?: () => void;
}

/**
 * 字段变更行组件
 */
const FieldDiffRow = memo<{ diff: FieldDiff }>(({ diff }) => {
  const { t } = useTranslation();
  const icon =
    diff.type === 'add' ? (
      <Plus className="h-3.5 w-3.5 text-green-500" />
    ) : diff.type === 'remove' ? (
      <Minus className="h-3.5 w-3.5 text-red-500" />
    ) : (
      <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
    );

  const bgClass =
    diff.type === 'add'
      ? 'bg-green-500/10 border-green-500/20'
      : diff.type === 'remove'
        ? 'bg-red-500/10 border-red-500/20'
        : 'bg-amber-500/10 border-amber-500/20';

  const field = diff.type === 'remove' ? diff.oldField : diff.newField;
  const oldField = diff.oldField;

  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', bgClass)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{diff.fieldName}</span>
          {field && <span className="text-muted-foreground">{field.type}</span>}
          {field && !field.nullable && (
            <span className="text-xs text-muted-foreground">NOT NULL</span>
          )}
        </div>
        {diff.type === 'modify' && diff.changes && oldField && (
          <div className="mt-1 text-xs text-muted-foreground">
            {diff.changes.includes('type') && (
              <span className="mr-2">
                {t('diffDialog.type')}: {oldField.type} → {field?.type}
              </span>
            )}
            {diff.changes.includes('nullable') && (
              <span className="mr-2">
                {t('diffDialog.nullable')}:{' '}
                {oldField.nullable ? t('fieldEnums.nullable.yes') : t('fieldEnums.nullable.no')} →{' '}
                {field?.nullable ? t('fieldEnums.nullable.yes') : t('fieldEnums.nullable.no')}
              </span>
            )}
            {diff.changes.includes('comment') && (
              <span className="mr-2">{t('diffDialog.commentChanged')}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
FieldDiffRow.displayName = 'FieldDiffRow';

/**
 * 索引变更行组件
 */
const IndexDiffRow = memo<{ diff: IndexDiff }>(({ diff }) => {
  const { t } = useTranslation();
  const icon =
    diff.type === 'add' ? (
      <Plus className="h-3.5 w-3.5 text-green-500" />
    ) : (
      <Minus className="h-3.5 w-3.5 text-red-500" />
    );

  const bgClass =
    diff.type === 'add' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20';

  const index = diff.index;
  const fieldList = index.fields.map((f) => f.name).join(', ');
  const typeLabel = index.isPrimary
    ? t('diffDialog.indexTypePrimary')
    : index.unique
      ? t('diffDialog.indexTypeUnique')
      : t('diffDialog.indexTypeNormal');

  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', bgClass)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{index.name}</span>
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">({fieldList})</div>
      </div>
    </div>
  );
});
IndexDiffRow.displayName = 'IndexDiffRow';

/**
 * Diff 对话框组件
 */
export const DiffDialog = memo<DiffDialogProps>(
  ({ open, onOpenChange, tableName, dbType, diff, fields, onCopy }) => {
    const { t } = useTranslation();
    const [showRollback, setShowRollback] = useState(false);

    const alterDDL = useMemo(() => {
      if (!diff?.hasChanges) return '';
      return generateAlterDDL(tableName, diff, fields, dbType);
    }, [tableName, diff, fields, dbType]);

    const rollbackDDL = useMemo(() => {
      if (!diff?.hasChanges) return '';
      return generateRollbackDDL(tableName, diff, fields, dbType);
    }, [tableName, diff, fields, dbType]);

    const handleCopy = useCallback(async () => {
      if (!alterDDL) return;
      try {
        await navigator.clipboard.writeText(alterDDL);
        onCopy?.();
      } catch {
        // 忽略复制失败
      }
    }, [alterDDL, onCopy]);

    const handleCopyRollback = useCallback(async () => {
      if (!rollbackDDL) return;
      try {
        await navigator.clipboard.writeText(rollbackDDL);
        onCopy?.();
      } catch {
        // 忽略复制失败
      }
    }, [rollbackDDL, onCopy]);

    if (!diff) return null;

    const hasFieldChanges = diff.fields.length > 0;
    const hasIndexChanges = diff.indexes.length > 0;
    const hasTableMetaChanges =
      diff.tableNameChanged || diff.tableCommentChanged || diff.miscConfigChanged;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t('diffDialog.title')}</DialogTitle>
            <DialogDescription>{t('diffDialog.description')}</DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            {/* 表元数据变更 */}
            {hasTableMetaChanges && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('diffDialog.tableMetaChanges')}
                </h4>
                {diff.tableNameChanged && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t('diffDialog.tableName')}: </span>
                    <span className="line-through">{diff.oldTableName}</span>
                    <span className="mx-1">→</span>
                    <span className="font-medium">{diff.newTableName}</span>
                  </div>
                )}
                {diff.tableCommentChanged && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      {t('diffDialog.tableCommentChanged')}
                    </span>
                  </div>
                )}
                {diff.miscConfigChanged && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t('diffDialog.miscChanged')}</span>
                    {diff.oldMiscConfig && diff.newMiscConfig && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {diff.oldMiscConfig.enabled !== diff.newMiscConfig.enabled && (
                          <div>
                            {t('diffDialog.enabledStatus')}:{' '}
                            {diff.oldMiscConfig.enabled
                              ? t('diffDialog.enabled')
                              : t('diffDialog.disabled')}
                            <span className="mx-1">→</span>
                            {diff.newMiscConfig.enabled
                              ? t('diffDialog.enabled')
                              : t('diffDialog.disabled')}
                          </div>
                        )}
                        {diff.oldMiscConfig.enabled && diff.newMiscConfig.enabled && (
                          <>
                            {diff.oldMiscConfig.engine !== diff.newMiscConfig.engine && (
                              <div>
                                {t('diffDialog.engine')}:{' '}
                                {diff.oldMiscConfig.engine || t('diffDialog.default')}
                                <span className="mx-1">→</span>
                                {diff.newMiscConfig.engine || t('diffDialog.default')}
                              </div>
                            )}
                            {diff.oldMiscConfig.charset !== diff.newMiscConfig.charset && (
                              <div>
                                {t('diffDialog.charset')}:{' '}
                                {diff.oldMiscConfig.charset || t('diffDialog.default')}
                                <span className="mx-1">→</span>
                                {diff.newMiscConfig.charset || t('diffDialog.default')}
                              </div>
                            )}
                            {diff.oldMiscConfig.collation !== diff.newMiscConfig.collation && (
                              <div>
                                {t('diffDialog.collation')}:{' '}
                                {diff.oldMiscConfig.collation || t('diffDialog.default')}
                                <span className="mx-1">→</span>
                                {diff.newMiscConfig.collation || t('diffDialog.default')}
                              </div>
                            )}
                            {diff.oldMiscConfig.tablespace !== diff.newMiscConfig.tablespace && (
                              <div>
                                {t('diffDialog.tablespace')}:{' '}
                                {diff.oldMiscConfig.tablespace || t('diffDialog.default')}
                                <span className="mx-1">→</span>
                                {diff.newMiscConfig.tablespace || t('diffDialog.default')}
                              </div>
                            )}
                            {diff.oldMiscConfig.fillfactor !== diff.newMiscConfig.fillfactor && (
                              <div>
                                FILLFACTOR:{' '}
                                {diff.oldMiscConfig.fillfactor ?? t('diffDialog.default')}
                                <span className="mx-1">→</span>
                                {diff.newMiscConfig.fillfactor ?? t('diffDialog.default')}
                              </div>
                            )}
                            {diff.oldMiscConfig.pctfree !== diff.newMiscConfig.pctfree && (
                              <div>
                                PCTFREE: {diff.oldMiscConfig.pctfree ?? t('diffDialog.default')}
                                <span className="mx-1">→</span>
                                {diff.newMiscConfig.pctfree ?? t('diffDialog.default')}
                              </div>
                            )}
                            {diff.oldMiscConfig.initrans !== diff.newMiscConfig.initrans && (
                              <div>
                                INITRANS: {diff.oldMiscConfig.initrans ?? t('diffDialog.default')}
                                <span className="mx-1">→</span>
                                {diff.newMiscConfig.initrans ?? t('diffDialog.default')}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 字段变更 */}
            {hasFieldChanges && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('diffDialog.fieldChanges', { count: diff.fields.length })}
                </h4>
                <div className="space-y-1.5">
                  {diff.fields.map((f, i) => (
                    <FieldDiffRow key={`${f.fieldName}-${i}`} diff={f} />
                  ))}
                </div>
              </div>
            )}

            {/* 索引变更 */}
            {hasIndexChanges && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('diffDialog.indexChanges', { count: diff.indexes.length })}
                </h4>
                <div className="space-y-1.5">
                  {diff.indexes.map((idx, i) => (
                    <IndexDiffRow key={`${idx.index.name}-${i}`} diff={idx} />
                  ))}
                </div>
              </div>
            )}

            {/* 变更脚本 */}
            {alterDDL && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {t('diffDialog.alterScript')}
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 gap-1.5 px-2 text-xs font-medium"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t('diffDialog.copy')}
                  </Button>
                </div>
                <div className="max-h-48 overflow-auto rounded-md border bg-muted/30">
                  <Suspense
                    fallback={
                      <pre className="m-0 whitespace-pre-wrap p-3 font-mono text-xs">
                        {alterDDL}
                      </pre>
                    }
                  >
                    <SqlCodeBlock code={alterDDL} />
                  </Suspense>
                </div>
              </div>
            )}

            {/* 回滚脚本 */}
            {rollbackDDL && (
              <div className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowRollback(!showRollback)}
                >
                  {showRollback ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('diffDialog.rollbackScript')}
                </button>
                {showRollback && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-amber-600 dark:text-amber-300">
                        {t('diffDialog.rollbackWarning')}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyRollback}
                        className="h-7 gap-1.5 px-2 text-xs font-medium"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {t('diffDialog.copyRollback')}
                      </Button>
                    </div>
                    <div className="max-h-48 overflow-auto rounded-md border border-amber-300/60 bg-amber-50/20 dark:border-amber-700/60 dark:bg-amber-950/35">
                      <Suspense
                        fallback={
                          <pre className="m-0 whitespace-pre-wrap p-3 font-mono text-xs">
                            {rollbackDDL}
                          </pre>
                        }
                      >
                        <SqlCodeBlock code={rollbackDDL} />
                      </Suspense>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);
DiffDialog.displayName = 'DiffDialog';
