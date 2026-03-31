import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GitCompare, List, Save, Sparkles, Table, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/select';
import type { DatabaseType } from '@/types';
import { DATABASE_OPTIONS } from '@/utils/constants';
import { useTranslation } from 'react-i18next';

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
  onViewDiff?: () => void;
  onOpenAIGenerate?: () => void;
  saveDisabled?: boolean;
  saveDisabledHint?: string;
  showDiffButton?: boolean;
  loadedStatus?: 'clean' | 'dirty' | null;
  loadedTableName?: string | null;
  workspaceLabel?: string | null;
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
    onViewDiff,
    onOpenAIGenerate,
    saveDisabled = false,
    saveDisabledHint,
    showDiffButton = false,
    loadedStatus = null,
    loadedTableName = null,
    workspaceLabel = null,
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
      <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-shadow transition-transform duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
        {/* Decorative gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

        <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 px-4 py-3.5">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary transition-all duration-300 group-hover:bg-primary/15">
              <Table className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
              {t('tableConfig.title')}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={onOpenSavedTables}
                >
                  <List className="h-3.5 w-3.5" />
                  {t('tableConfig.openSavedTables')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('tableConfig.openSavedTablesTip')}</p>
              </TooltipContent>
            </Tooltip>
            {(workspaceLabel || loadedTableName) && (
              <span className="max-w-[240px] truncate text-xs text-muted-foreground">
                {workspaceLabel || loadedTableName}
              </span>
            )}
            {onOpenAIGenerate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs font-medium text-primary border-primary/30 hover:bg-primary/10"
                    onClick={onOpenAIGenerate}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('tableConfig.aiGenerate')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('tableConfig.aiGenerateTip')}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md"
                onClick={onClearAll}
              >
                <Trash2 className="h-3.5 w-3.5 transition-transform duration-200" />{' '}
                {t('tableConfig.clearAll')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('tableConfig.clearAllTip')}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="relative p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-3 group/field">
              <Label
                htmlFor="table-name"
                className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary"
              >
                {t('tableConfig.tableName')}
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="table-name"
                  placeholder={t('tableConfig.tableNamePlaceholder')}
                  value={tableName}
                  onChange={(event) => onTableNameChange(event.target.value)}
                  className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* Wrap enabled button in span to ensure tooltip works even if button is disabled/pointer-events-none */}
                    <span className="inline-flex" tabIndex={saveDisabled ? 0 : -1}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={onSaveTable}
                        disabled={saveDisabled}
                        aria-label={
                          saveDisabled && saveDisabledHint
                            ? t('tableConfig.saveDisabled', {
                                reason: saveDisabledHint,
                              })
                            : t('tableConfig.saveCurrent')
                        }
                        aria-describedby={
                          saveDisabled && saveDisabledHint ? 'save-disabled-reason' : undefined
                        }
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{saveDisabled ? saveDisabledHint : t('tableConfig.saveCurrent')}</p>
                  </TooltipContent>
                </Tooltip>
                {saveDisabled && saveDisabledHint && (
                  <span id="save-disabled-reason" className="sr-only">
                    {saveDisabledHint}
                  </span>
                )}
                {showDiffButton && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={onViewDiff}
                        aria-label={t('tableConfig.viewDiff')}
                      >
                        <GitCompare className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('tableConfig.viewDiff')}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {statusLabel && <span className={`text-xs ${statusClass}`}>{statusLabel}</span>}
              </div>
            </div>
            <div className="space-y-3 group/field">
              <Label
                htmlFor="table-comment"
                className="text-sm font-medium transition-colors duration-200 group-hover/field:text-primary"
              >
                {t('tableConfig.tableComment')}
              </Label>
              <Input
                id="table-comment"
                placeholder={t('tableConfig.tableCommentPlaceholder')}
                value={tableComment}
                onChange={(event) => onTableCommentChange(event.target.value)}
                className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-3 group/field">
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
          </div>
        </div>
      </div>
    );
  },
);
