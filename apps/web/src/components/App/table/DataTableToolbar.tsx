import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AnimatedNumber } from '@/components/ui/animated-number';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronDown,
  HardDrive,
  Languages,
  WandSparkles,
  Minus,
  Plus,
  Pin,
  ListPlus,
  TableProperties,
} from 'lucide-react';
import { COLUMN_HEADERS } from '@/utils/constants';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { AICommentMode } from '@ddlbuilder/shared-types';

interface DataTableToolbarProps {
  toolbarLeft?: ReactNode;
  onOpenStorageEstimator?: () => void;
  onOpenMockDataGenerator?: () => void;
  onOpenAISchemaPatch?: () => void;
  onGenerateComments?: (mode: AICommentMode, targetLocale?: 'zh-CN' | 'en-US') => void;
  isGeneratingComments?: boolean;
  freezeEnabled: boolean;
  onFreezeEnabledChange: (value: boolean) => void;
  effectiveFreezeColumns: number;
  onFreezeColumnsChange: (value: number) => void;
  safeAddCount: number;
  onAddCountChange: (value: number) => void;
  onAddRowsClick: () => void;
}

export function DataTableToolbar({
  toolbarLeft,
  onOpenStorageEstimator,
  onOpenMockDataGenerator,
  onOpenAISchemaPatch,
  onGenerateComments,
  isGeneratingComments = false,
  freezeEnabled,
  onFreezeEnabledChange,
  effectiveFreezeColumns,
  onFreezeColumnsChange,
  safeAddCount,
  onAddCountChange,
  onAddRowsClick,
}: DataTableToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="relative border-b border-primary/10 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {toolbarLeft}
          {onOpenStorageEstimator && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenStorageEstimator}
                  className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md border-primary/20 hover:border-primary/50 text-muted-foreground hover:text-primary"
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  {t('dataTable.toolbar.storageEstimator')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('dataTable.toolbar.storageEstimatorTip')}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {onOpenMockDataGenerator && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenMockDataGenerator}
                  className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md border-primary/20 hover:border-primary/50 text-muted-foreground hover:text-primary"
                >
                  <TableProperties className="h-3.5 w-3.5" />
                  {t('dataTable.toolbar.mockData')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('dataTable.toolbar.mockDataTip')}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {onOpenAISchemaPatch && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenAISchemaPatch}
                  className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md border-primary/20 hover:border-primary/50 text-muted-foreground hover:text-primary"
                >
                  <WandSparkles className="h-3.5 w-3.5" />
                  {t('dataTable.toolbar.aiPatch')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('dataTable.toolbar.aiPatchTip')}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {onGenerateComments && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isGeneratingComments}
                      className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md border-primary/20 hover:border-primary/50 text-muted-foreground hover:text-primary"
                    >
                      <Languages className="h-3.5 w-3.5" />
                      {isGeneratingComments
                        ? t('dataTable.toolbar.aiCommentsRunning')
                        : t('dataTable.toolbar.aiComments')}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('dataTable.toolbar.aiCommentsTip')}</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => onGenerateComments('fill_missing')}>
                  {t('dataTable.toolbar.aiCommentsFillMissing')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onGenerateComments('translate', 'zh-CN')}>
                  {t('dataTable.toolbar.aiCommentsTranslateZh')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onGenerateComments('translate', 'en-US')}>
                  {t('dataTable.toolbar.aiCommentsTranslateEn')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-7 items-center rounded-md border shadow-sm transition-all hover:shadow-md bg-background">
            <div className="flex h-full items-center gap-2 border-r bg-muted/30 px-2 pl-2.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label
                    htmlFor="field-freeze-switch"
                    className="flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground select-none"
                  >
                    <Pin className="h-3.5 w-3.5" />
                    {t('dataTable.toolbar.freeze')}
                  </Label>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('dataTable.toolbar.freezeTip')}</p>
                </TooltipContent>
              </Tooltip>
              <Switch
                id="field-freeze-switch"
                checked={freezeEnabled}
                onCheckedChange={onFreezeEnabledChange}
                className="scale-75 data-[state=checked]:bg-primary"
                aria-label={t('dataTable.toolbar.freezeAria')}
              />
            </div>
            <div className="flex h-full items-center gap-1 px-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={!freezeEnabled || effectiveFreezeColumns <= 1}
                    onClick={() => onFreezeColumnsChange(Math.max(1, effectiveFreezeColumns - 1))}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('dataTable.toolbar.freezeDecrease')}</p>
                </TooltipContent>
              </Tooltip>
              <span
                className={cn(
                  'min-w-[1.25rem] text-center text-xs font-medium tabular-nums',
                  !freezeEnabled && 'text-muted-foreground opacity-50',
                )}
              >
                <AnimatedNumber
                  value={effectiveFreezeColumns}
                  format={{ useGrouping: false, maximumFractionDigits: 0 }}
                />
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={!freezeEnabled || effectiveFreezeColumns >= COLUMN_HEADERS.length}
                    onClick={() =>
                      onFreezeColumnsChange(
                        Math.min(COLUMN_HEADERS.length, effectiveFreezeColumns + 1),
                      )
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('dataTable.toolbar.freezeIncrease')}</p>
                </TooltipContent>
              </Tooltip>
              <Label
                className={cn(
                  'ml-0.5 text-xs text-muted-foreground',
                  !freezeEnabled && 'opacity-50',
                )}
              >
                {t('dataTable.toolbar.columnUnit')}
              </Label>
            </div>
          </div>

          <div className="flex h-7 items-center rounded-md border shadow-sm transition-all hover:shadow-md bg-background">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onAddRowsClick}
                  variant="ghost"
                  size="sm"
                  className="h-full rounded-none rounded-l-md border-r px-3 text-xs font-medium hover:bg-muted/50"
                >
                  <ListPlus className="mr-1.5 h-3.5 w-3.5" />
                  {t('dataTable.toolbar.addRows')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('dataTable.toolbar.addRowsTip')}</p>
              </TooltipContent>
            </Tooltip>
            <div className="flex h-full items-center gap-1 px-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    disabled={safeAddCount <= 1}
                    onClick={() => onAddCountChange(Math.max(1, safeAddCount - 1))}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('dataTable.toolbar.addCountDecrease')}</p>
                </TooltipContent>
              </Tooltip>
              <span className="min-w-[1.25rem] text-center text-xs font-medium tabular-nums">
                <AnimatedNumber
                  value={safeAddCount}
                  format={{ useGrouping: false, maximumFractionDigits: 0 }}
                />
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onAddCountChange(safeAddCount + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('dataTable.toolbar.addCountIncrease')}</p>
                </TooltipContent>
              </Tooltip>
              <span className="ml-0.5 text-xs text-muted-foreground">
                {t('dataTable.toolbar.rowUnit')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
