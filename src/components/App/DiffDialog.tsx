import { memo, useMemo, useCallback } from 'react';
import { Copy, Plus, Minus, RefreshCw } from 'lucide-react';
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
import { generateAlterDDL } from '@/utils/alterDdlGenerator';
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
          {field && (
            <span className="text-muted-foreground">{field.type}</span>
          )}
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
    const alterDDL = useMemo(() => {
      if (!diff || !diff.hasChanges) return '';
      return generateAlterDDL(tableName, diff, fields, dbType);
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

    if (!diff) return null;

    const hasFieldChanges = diff.fields.length > 0;
    const hasIndexChanges = diff.indexes.length > 0;
    const hasTableMetaChanges =
      diff.tableNameChanged || diff.tableCommentChanged;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>表结构变更对比</DialogTitle>
            <DialogDescription>
              对比当前表与已保存版本的差异
            </DialogDescription>
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
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);
DiffDialog.displayName = 'DiffDialog';
