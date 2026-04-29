import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Eye, GitCompare, Table, Trash2, Waypoints } from 'lucide-react';
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
  onViewDiff?: () => void;
  onOpenErDiagram?: () => void;
  showDiffButton?: boolean;
  loadedStatus?: string | null;
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
    onViewDiff,
    onOpenErDiagram,
    showDiffButton = false,
    loadedStatus = null,
    loadedTableName = null,
    workspaceLabel = null,
    fieldCount = 0,
    indexCount = 0,
  }) => {
    const { t } = useTranslation();
    const statusLabel =
      loadedStatus === 'dirty'
        ? t('tableConfig.statusDirty')
        : loadedStatus === 'clean'
          ? t('tableConfig.statusClean')
          : '';
    const statusClass = loadedStatus === 'dirty' ? 'text-amber-600' : 'text-muted-foreground';

    return (
      <div className="rounded-lg border bg-card/95 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {(workspaceLabel || loadedTableName) && (
              <span className="max-w-[320px] truncate text-xs text-muted-foreground">
                {workspaceLabel || loadedTableName}
              </span>
            )}
            {statusLabel && <span className={`text-xs ${statusClass}`}>{statusLabel}</span>}
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
        <div className="p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2 group/field">
              <Label
                htmlFor="table-name"
                className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary"
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
                className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2 group/field">
              <Label
                htmlFor="schema-name"
                className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary"
              >
                {t('tableConfig.schemaName')}
              </Label>
              <Input
                id="schema-name"
                placeholder={t('tableConfig.schemaNamePlaceholder')}
                value={schemaName}
                onChange={(event) => onSchemaNameChange(event.target.value)}
                className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2 group/field">
              <Label
                htmlFor="table-comment"
                className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary"
              >
                {objectType === 'view'
                  ? t('tableConfig.viewComment')
                  : t('tableConfig.tableComment')}
              </Label>
              <Input
                id="table-comment"
                placeholder={t('tableConfig.tableCommentPlaceholder')}
                value={tableComment}
                onChange={(event) => onTableCommentChange(event.target.value)}
                className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2 group/field">
              <Label
                htmlFor="db-type-select"
                className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary"
              >
                {t('tableConfig.dbType')}
              </Label>
              <SearchableSelect
                value={dbType}
                onValueChange={(value) => onDbTypeChange(value as DatabaseType)}
                options={DATABASE_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
                id="db-type-select"
                data-testid="db-type-selector"
                triggerClassName="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                emptyMessage={t('searchableSelect.empty')}
                renderTrigger={() => {
                  const selectedOption = DATABASE_OPTIONS.find((option) => option.value === dbType);
                  if (!selectedOption) return t('tableConfig.dbTypePlaceholder');
                  const Icon = selectedOption.icon;
                  return (
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="font-medium">{selectedOption.label}</span>
                    </div>
                  );
                }}
                renderItem={(option) => {
                  const dbOption = DATABASE_OPTIONS.find((opt) => opt.value === option.value);
                  if (!dbOption) return <span>{option.label}</span>;
                  const Icon = dbOption.icon;
                  return (
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="font-medium">{option.label}</span>
                    </div>
                  );
                }}
              />
            </div>
            <div className="space-y-3 group/field">
              <Label className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary">
                {t('tableConfig.objectType')}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={objectType === 'table' ? 'default' : 'outline'}
                  className="h-9 gap-2"
                  onClick={() => onObjectTypeChange('table')}
                >
                  <Table className="h-4 w-4" />
                  {t('tableConfig.objectTable')}
                </Button>
                <Button
                  type="button"
                  variant={objectType === 'view' ? 'default' : 'outline'}
                  className="h-9 gap-2"
                  onClick={() => onObjectTypeChange('view')}
                >
                  <Eye className="h-4 w-4" />
                  {t('tableConfig.objectView')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
