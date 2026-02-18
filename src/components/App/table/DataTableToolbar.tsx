import type { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { HardDrive, Minus, Plus, Pin, ListPlus } from 'lucide-react';
import { COLUMN_HEADERS } from '@/utils/constants';
import { cn } from '@/lib/utils';

interface DataTableToolbarProps {
  toolbarLeft?: ReactNode;
  onOpenStorageEstimator?: () => void;
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
  freezeEnabled,
  onFreezeEnabledChange,
  effectiveFreezeColumns,
  onFreezeColumnsChange,
  safeAddCount,
  onAddCountChange,
  onAddRowsClick,
}: DataTableToolbarProps) {
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
                  估算容量
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>估算当前表数据量占用空间</p>
              </TooltipContent>
            </Tooltip>
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
                    冻结
                  </Label>
                </TooltipTrigger>
                <TooltipContent>
                  <p>锁定前几列，使其在横向滚动时保持可见</p>
                </TooltipContent>
              </Tooltip>
              <Switch
                id="field-freeze-switch"
                checked={freezeEnabled}
                onCheckedChange={onFreezeEnabledChange}
                className="scale-75 data-[state=checked]:bg-primary"
                aria-label="启用字段表格列冻结"
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
                    onClick={() =>
                      onFreezeColumnsChange(
                        Math.max(1, effectiveFreezeColumns - 1),
                      )
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>减少冻结列数</p>
                </TooltipContent>
              </Tooltip>
              <span
                className={cn(
                  'min-w-[1.25rem] text-center text-xs font-medium tabular-nums',
                  !freezeEnabled && 'text-muted-foreground opacity-50',
                )}
              >
                {effectiveFreezeColumns}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={
                      !freezeEnabled ||
                      effectiveFreezeColumns >= COLUMN_HEADERS.length
                    }
                    onClick={() =>
                      onFreezeColumnsChange(
                        Math.min(
                          COLUMN_HEADERS.length,
                          effectiveFreezeColumns + 1,
                        ),
                      )
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>增加冻结列数</p>
                </TooltipContent>
              </Tooltip>
              <Label
                className={cn(
                  'ml-0.5 text-xs text-muted-foreground',
                  !freezeEnabled && 'opacity-50',
                )}
              >
                列
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
                  添加行
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>在表格末尾添加空行</p>
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
                    onClick={() =>
                      onAddCountChange(Math.max(1, safeAddCount - 1))
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>减少每次添加的行数</p>
                </TooltipContent>
              </Tooltip>
              <span className="min-w-[1.25rem] text-center text-xs font-medium tabular-nums">
                {safeAddCount}
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
                  <p>增加每次添加的行数</p>
                </TooltipContent>
              </Tooltip>
              <span className="ml-0.5 text-xs text-muted-foreground">行</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
