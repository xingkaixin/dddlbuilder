import { memo, useMemo, useCallback, useState } from 'react';
import {
  Copy,
  Plus,
  Minus,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import SqlCodeBlock from './SqlCodeBlock';
import type { TableDiff, FieldDiff, IndexDiff } from '@/utils/tableDiff';
import type { NormalizedField, DatabaseType } from '@/types';
import {
  generateAlterDDL,
  generateRollbackDDL,
} from '@/utils/alterDdlGenerator';
import { cn } from '@/lib/utils';

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
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        bgClass,
      )}
    >
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
                类型: {oldField.type} → {field?.type}
              </span>
            )}
            {diff.changes.includes('nullable') && (
              <span className="mr-2">
                可空: {oldField.nullable ? '是' : '否'} →{' '}
                {field?.nullable ? '是' : '否'}
              </span>
            )}
            {diff.changes.includes('comment') && (
              <span className="mr-2">注释已变更</span>
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
  const icon =
    diff.type === 'add' ? (
      <Plus className="h-3.5 w-3.5 text-green-500" />
    ) : (
      <Minus className="h-3.5 w-3.5 text-red-500" />
    );

  const bgClass =
    diff.type === 'add'
      ? 'bg-green-500/10 border-green-500/20'
      : 'bg-red-500/10 border-red-500/20';

  const index = diff.index;
  const fieldList = index.fields.map((f) => f.name).join(', ');
  const typeLabel = index.isPrimary
    ? 'PRIMARY KEY'
    : index.unique
      ? 'UNIQUE'
      : 'INDEX';

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        bgClass,
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{index.name}</span>
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          ({fieldList})
        </div>
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
    const [showRollback, setShowRollback] = useState(false);

    const alterDDL = useMemo(() => {
      if (!diff || !diff.hasChanges) return '';
      return generateAlterDDL(tableName, diff, fields, dbType);
    }, [tableName, diff, fields, dbType]);

    const rollbackDDL = useMemo(() => {
      if (!diff || !diff.hasChanges) return '';
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
      diff.tableNameChanged ||
      diff.tableCommentChanged ||
      diff.miscConfigChanged;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>表结构变更对比</DialogTitle>
            <DialogDescription>对比当前表与已保存版本的差异</DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            {/* 表元数据变更 */}
            {hasTableMetaChanges && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  表配置变更
                </h4>
                {diff.tableNameChanged && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">表名: </span>
                    <span className="line-through">{diff.oldTableName}</span>
                    <span className="mx-1">→</span>
                    <span className="font-medium">{diff.newTableName}</span>
                  </div>
                )}
                {diff.tableCommentChanged && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">表注释已变更</span>
                  </div>
                )}
                {diff.miscConfigChanged && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      杂项设置已变更
                    </span>
                    {diff.oldMiscConfig && diff.newMiscConfig && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {diff.oldMiscConfig.enabled !==
                          diff.newMiscConfig.enabled && (
                          <div>
                            启用状态:{' '}
                            {diff.oldMiscConfig.enabled ? '开启' : '关闭'}
                            <span className="mx-1">→</span>
                            {diff.newMiscConfig.enabled ? '开启' : '关闭'}
                          </div>
                        )}
                        {diff.oldMiscConfig.enabled &&
                          diff.newMiscConfig.enabled && (
                            <>
                              {diff.oldMiscConfig.engine !==
                                diff.newMiscConfig.engine && (
                                <div>
                                  引擎: {diff.oldMiscConfig.engine || '默认'}
                                  <span className="mx-1">→</span>
                                  {diff.newMiscConfig.engine || '默认'}
                                </div>
                              )}
                              {diff.oldMiscConfig.charset !==
                                diff.newMiscConfig.charset && (
                                <div>
                                  字符集: {diff.oldMiscConfig.charset || '默认'}
                                  <span className="mx-1">→</span>
                                  {diff.newMiscConfig.charset || '默认'}
                                </div>
                              )}
                              {diff.oldMiscConfig.collation !==
                                diff.newMiscConfig.collation && (
                                <div>
                                  排序规则:{' '}
                                  {diff.oldMiscConfig.collation || '默认'}
                                  <span className="mx-1">→</span>
                                  {diff.newMiscConfig.collation || '默认'}
                                </div>
                              )}
                              {diff.oldMiscConfig.tablespace !==
                                diff.newMiscConfig.tablespace && (
                                <div>
                                  表空间:{' '}
                                  {diff.oldMiscConfig.tablespace || '默认'}
                                  <span className="mx-1">→</span>
                                  {diff.newMiscConfig.tablespace || '默认'}
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
                  字段变更 ({diff.fields.length})
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
                  索引变更 ({diff.indexes.length})
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
                    变更脚本
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Copy className="h-3 w-3" />
                    复制
                  </Button>
                </div>
                <div className="max-h-48 overflow-auto rounded-md border bg-muted/30">
                  <SqlCodeBlock code={alterDDL} />
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
                  回滚脚本
                </button>
                {showRollback && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-amber-600">
                        执行回滚脚本将撤销以上变更
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyRollback}
                        className="h-7 gap-1.5 text-xs"
                      >
                        <Copy className="h-3 w-3" />
                        复制回滚
                      </Button>
                    </div>
                    <div className="max-h-48 overflow-auto rounded-md border border-amber-200 bg-amber-50/50">
                      <SqlCodeBlock code={rollbackDDL} />
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
