import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Eye, GitCompare, History, Save, Table, Trash2, Waypoints } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/select';
import type { DatabaseType, SchemaObjectType } from '@ddlbuilder/shared-types';
import { DATABASE_OPTIONS } from '@/utils/constants';
import { useTranslation } from 'react-i18next';

interface TableConfigProps {
  schemaName: string;
  tableName: string;
  tableComment: string;
  objectType: SchemaObjectType;
  dbType: DatabaseType;
  onSchemaNameChange: (value: string) => void;
  onTableNameChange: (value: string) => void;
  onTableCommentChange: (value: string) => void;
  onObjectTypeChange: (value: SchemaObjectType) => void;
  onDbTypeChange: (value: DatabaseType) => void;
  onClearAll: () => void;
  onSaveCurrent?: () => void;
  onViewDiff?: () => void;
  onViewHistory?: () => void;
  onOpenErDiagram?: () => void;
  saveDisabled?: boolean;
  saveDisabledHint?: string;
  showDiffButton?: boolean;
  showHistoryButton?: boolean;
  loadedTableName?: string | null;
  workspaceLabel?: string | null;
  fieldCount?: number;
  indexCount?: number;
}

export const TableConfig = memo<TableConfigProps>(
  ({
    schemaName,
    tableName,
    tableComment,
    objectType,
    dbType,
    onSchemaNameChange,
    onTableNameChange,
    onTableCommentChange,
    onObjectTypeChange,
    onDbTypeChange,
    onClearAll,
    onSaveCurrent,
    onViewDiff,
    onViewHistory,
    onOpenErDiagram,
    saveDisabled = false,
    saveDisabledHint,
    showDiffButton = false,
    showHistoryButton = false,
    loadedTableName = null,
    workspaceLabel = null,
    fieldCount = 0,
    indexCount = 0,
  }) => {
    const { t } = useTranslation();
    const selectedDbOption = DATABASE_OPTIONS.find((option) => option.value === dbType);

    return (
      <div className="rounded-lg border bg-card/95 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {(workspaceLabel || loadedTableName) && (
              <span className="max-w-[320px] truncate text-xs text-muted-foreground">
                {workspaceLabel || loadedTableName}
              </span>
            )}
            <div className="w-40">
              <SearchableSelect
                value={dbType}
                onValueChange={(value) => onDbTypeChange(value as DatabaseType)}
                options={DATABASE_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
                id="db-type-select"
                data-testid="db-type-selector"
                aria-label={t('tableConfig.dbType')}
                triggerClassName="h-7 rounded-md px-2 text-xs"
                emptyMessage={t('searchableSelect.empty')}
                renderTrigger={() => {
                  if (!selectedDbOption) return t('tableConfig.dbTypePlaceholder');
                  const Icon = selectedDbOption.icon;
                  return (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate font-medium">{selectedDbOption.label}</span>
                    </div>
                  );
                }}
                renderItem={(option) => {
                  const dbOption = DATABASE_OPTIONS.find((opt) => opt.value === option.value);
                  if (!dbOption) return <span>{option.label}</span>;
                  const Icon = dbOption.icon;
                  return (
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="font-medium">{option.label}</span>
                    </div>
                  );
                }}
              />
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t('tableConfig.fieldStat', { count: fieldCount })}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t('tableConfig.indexStat', { count: indexCount })}
            </span>
            {onOpenErDiagram && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={onOpenErDiagram}
                  >
                    <Waypoints className="h-3.5 w-3.5" />
                    {t('tableConfig.erDiagram')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('tableConfig.erDiagramTip')}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-1">
            {showHistoryButton && onViewHistory && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={onViewHistory}
                  >
                    <History className="h-3.5 w-3.5" />
                    {t('savedTables.history')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('savedTables.history')}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {showDiffButton && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={onViewDiff}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    {t('tableConfig.viewDiff')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('tableConfig.viewDiff')}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onSaveCurrent && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex" tabIndex={saveDisabled ? 0 : -1}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-xs"
                      onClick={onSaveCurrent}
                      disabled={saveDisabled}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {objectType === 'view'
                        ? t('tableConfig.saveCurrentView')
                        : t('tableConfig.saveCurrent')}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {saveDisabled
                      ? (saveDisabledHint ?? t('dialogs.save.disabledTip'))
                      : objectType === 'view'
                        ? t('tableConfig.saveCurrentView')
                        : t('tableConfig.saveCurrent')}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs font-medium text-destructive hover:text-destructive"
                  onClick={onClearAll}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('tableConfig.clearAll')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('tableConfig.clearAllTip')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 p-3">
          <div className="w-36 space-y-1.5 group/field">
            <Label
              htmlFor="object-type-select"
              className="text-xs font-medium transition-colors duration-200 group-hover/field:text-primary"
            >
              {t('tableConfig.objectType')}
            </Label>
            <SearchableSelect
              value={objectType}
              onValueChange={(value) => onObjectTypeChange(value as SchemaObjectType)}
              options={[
                { value: 'table', label: t('tableConfig.objectTable') },
                { value: 'view', label: t('tableConfig.objectView') },
              ]}
              id="object-type-select"
              emptyMessage={t('searchableSelect.empty')}
              triggerClassName="h-8 text-sm"
              renderTrigger={() => {
                const Icon = objectType === 'view' ? Eye : Table;
                return (
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">
                      {objectType === 'view'
                        ? t('tableConfig.objectView')
                        : t('tableConfig.objectTable')}
                    </span>
                  </div>
                );
              }}
              renderItem={(option) => {
                const Icon = option.value === 'view' ? Eye : Table;
                return (
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{option.label}</span>
                  </div>
                );
              }}
            />
          </div>
          <div className="w-56 space-y-1.5 group/field">
            <Label
              htmlFor="schema-name"
              className="text-xs font-medium transition-colors duration-200 group-hover/field:text-primary"
            >
              {t('tableConfig.schemaName')}
            </Label>
            <Input
              id="schema-name"
              placeholder={t('tableConfig.schemaNamePlaceholder')}
              value={schemaName}
              onChange={(event) => onSchemaNameChange(event.target.value)}
              className="h-8 text-sm transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="min-w-64 flex-1 space-y-1.5 group/field">
            <Label
              htmlFor="table-name"
              className="text-xs font-medium transition-colors duration-200 group-hover/field:text-primary"
            >
              {objectType === 'view' ? t('tableConfig.viewName') : t('tableConfig.tableName')}
            </Label>
            <Input
              id="table-name"
              placeholder={
                objectType === 'view'
                  ? t('tableConfig.viewNamePlaceholder')
                  : t('tableConfig.tableNamePlaceholder')
              }
              value={tableName}
              onChange={(event) => onTableNameChange(event.target.value)}
              className="h-8 text-sm transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="min-w-80 flex-[1.4] space-y-1.5 group/field">
            <Label
              htmlFor="table-comment"
              className="text-xs font-medium transition-colors duration-200 group-hover/field:text-primary"
            >
              {objectType === 'view' ? t('tableConfig.viewComment') : t('tableConfig.tableComment')}
            </Label>
            <Input
              id="table-comment"
              placeholder={t('tableConfig.tableCommentPlaceholder')}
              value={tableComment}
              onChange={(event) => onTableCommentChange(event.target.value)}
              className="h-8 text-sm transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>
    );
  },
);
