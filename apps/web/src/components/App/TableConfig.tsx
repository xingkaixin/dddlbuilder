import { memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Eye,
  GitCompare,
  History,
  Save,
  Table,
  Trash2,
  Waypoints,
  MoreHorizontal,
  SlidersHorizontal,
} from '@/components/icons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DatabaseType, SchemaObjectType } from '@ddlbuilder/shared-types';
import { DATABASE_OPTIONS } from './databaseOptions';
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
    workspaceLabel,
    loadedTableName,
  }) => {
    const { t } = useTranslation();
    const selectedDbOption = DATABASE_OPTIONS.find((option) => option.value === dbType);
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex items-center gap-1">
            {schemaName && (
              <span className="max-w-32 truncate text-sm text-muted-foreground" title={schemaName}>
                {schemaName} /
              </span>
            )}
            <Input
              id="table-name"
              aria-label={t(
                objectType === 'view' ? 'tableConfig.viewName' : 'tableConfig.tableName',
              )}
              placeholder={t(
                objectType === 'view'
                  ? 'tableConfig.viewNamePlaceholder'
                  : 'tableConfig.tableNamePlaceholder',
              )}
              value={tableName}
              onChange={(event) => onTableNameChange(event.target.value)}
              className="h-8 min-w-0 border-transparent bg-transparent px-1 text-lg font-semibold shadow-none hover:border-input focus:border-input"
            />
          </div>
          <Input
            id="table-comment"
            aria-label={t(
              objectType === 'view' ? 'tableConfig.viewComment' : 'tableConfig.tableComment',
            )}
            placeholder={t('tableConfig.tableCommentPlaceholder')}
            value={tableComment}
            onChange={(event) => onTableCommentChange(event.target.value)}
            className="h-7 border-transparent bg-transparent px-1 text-xs text-muted-foreground shadow-none hover:border-input focus:border-input"
          />
          {(workspaceLabel || loadedTableName) && (
            <span className="sr-only">{workspaceLabel || loadedTableName}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="table-config-actions">
          <div className="w-36">
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t('tableConfig.properties')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="object-type-select">{t('tableConfig.objectType')}</Label>
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
              <div className="space-y-1.5">
                <Label htmlFor="schema-name">{t('tableConfig.schemaName')}</Label>
                <Input
                  id="schema-name"
                  placeholder={t('tableConfig.schemaNamePlaceholder')}
                  value={schemaName}
                  onChange={(event) => onSchemaNameChange(event.target.value)}
                />
              </div>
            </PopoverContent>
          </Popover>
          {showHistoryButton && onViewHistory && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={onViewHistory}
            >
              <History className="h-3.5 w-3.5" />
              {t('savedTables.history')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                <MoreHorizontal className="h-4 w-4" />
                {t('tableConfig.more')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onOpenErDiagram && (
                <DropdownMenuItem onClick={onOpenErDiagram}>
                  <Waypoints className="h-4 w-4" />
                  {t('tableConfig.erDiagram')}
                </DropdownMenuItem>
              )}
              {showDiffButton && onViewDiff && (
                <DropdownMenuItem onClick={onViewDiff}>
                  <GitCompare className="h-4 w-4" />
                  {t('tableConfig.viewDiff')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onClearAll} className="text-destructive">
                <Trash2 className="h-4 w-4" />
                {t('tableConfig.clearAll')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {onSaveCurrent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={onSaveCurrent}
                    disabled={saveDisabled}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {t(
                      objectType === 'view'
                        ? 'tableConfig.saveCurrentView'
                        : 'tableConfig.saveCurrent',
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {saveDisabled
                  ? (saveDisabledHint ?? t('dialogs.save.disabledTip'))
                  : t('tableConfig.saveCurrent')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    );
  },
);
