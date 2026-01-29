import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { List, Save, Table, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DatabaseType } from '@/types';
import { DATABASE_OPTIONS } from '@/utils/constants';

interface TableConfigProps {
  tableName: string;
  tableComment: string;
  dbType: DatabaseType;
  onTableNameChange: (value: string) => void;
  onTableCommentChange: (value: string) => void;
  onDbTypeChange: (value: DatabaseType) => void;
  onClearAll: () => void;
  onSaveTable: () => void;
  onOpenSavedTables: () => void;
  saveDisabled?: boolean;
  saveDisabledHint?: string;
  loadedStatus?: 'clean' | 'dirty' | null;
  loadedTableName?: string | null;
}

export const TableConfig = memo<TableConfigProps>(
  ({
    tableName,
    tableComment,
    dbType,
    onTableNameChange,
    onTableCommentChange,
    onDbTypeChange,
    onClearAll,
    onSaveTable,
    onOpenSavedTables,
    saveDisabled = false,
    saveDisabledHint,
    loadedStatus = null,
    loadedTableName = null,
  }) => {
    const statusLabel =
      loadedStatus === 'dirty'
        ? '已修改'
        : loadedStatus === 'clean'
          ? '已加载'
          : '';
    const statusClass =
      loadedStatus === 'dirty'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';

    return (
      <div className="rounded-lg border bg-card shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Table className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">表配置</span>
            {loadedTableName && (
              <span className="max-w-[200px] truncate text-xs text-muted-foreground">
                · {loadedTableName}
              </span>
            )}
            {statusLabel && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
              >
                {statusLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onOpenSavedTables}
            >
              <List className="h-3.5 w-3.5" />
              已保存
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
              onClick={onClearAll}
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空
            </Button>
          </div>
        </div>

        {/* Form */}
        <div className="p-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Table Name */}
            <div className="space-y-2">
              <Label htmlFor="table-name" className="text-xs font-medium">
                表名
              </Label>
              <div className="flex gap-2">
                <Input
                  id="table-name"
                  placeholder="例如: order_info"
                  value={tableName}
                  onChange={(event) => onTableNameChange(event.target.value)}
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={onSaveTable}
                  disabled={saveDisabled}
                  title={saveDisabled ? saveDisabledHint : '保存表'}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Table Comment */}
            <div className="space-y-2">
              <Label htmlFor="table-comment" className="text-xs font-medium">
                表中文名
              </Label>
              <Input
                id="table-comment"
                placeholder="例如: 订单信息表"
                value={tableComment}
                onChange={(event) => onTableCommentChange(event.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Database Type */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">数据库类型</Label>
              <Select
                value={dbType}
                onValueChange={(value) => onDbTypeChange(value as DatabaseType)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue>
                    {(() => {
                      const selectedOption = DATABASE_OPTIONS.find(
                        (option) => option.value === dbType,
                      );
                      if (!selectedOption) return '请选择';
                      const Icon = selectedOption.icon;
                      return (
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <span>{selectedOption.label}</span>
                        </div>
                      );
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DATABASE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
