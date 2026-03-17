import { memo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Layers, Plus, X } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import type { HivePartitionConfig, HivePartitionColumn } from '@/types';

const HIVE_TYPE_OPTIONS = ['STRING', 'INT', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'DECIMAL'];

interface HivePartitionPanelProps {
  config: HivePartitionConfig;
  onEnabledChange: (enabled: boolean) => void;
  onAddColumn: (column: HivePartitionColumn) => void;
  onRemoveColumn: (name: string) => void;
  onUpdateColumn: (
    originalName: string,
    column: HivePartitionColumn,
  ) => void;
}

export const HivePartitionPanel = memo<HivePartitionPanelProps>(
  ({
    config,
    onEnabledChange,
    onAddColumn,
    onRemoveColumn,
    onUpdateColumn,
  }) => {
    const { t } = useTranslation();

    const handleAddColumn = () => {
      onAddColumn({ name: '', type: 'STRING', comment: '' });
    };

    return (
      <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

        <div className="relative p-4">
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <Layers className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{t('hivePartitionPanel.title')}</p>
                <p className="mt-1 text-xs opacity-80">
                  {t('hivePartitionPanel.description')}
                </p>
              </div>
            </div>

            {/* Enable Partition Switch */}
            <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold">
                  {t('hivePartitionPanel.enable')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('hivePartitionPanel.enableDesc')}
                </p>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={onEnabledChange}
              />
            </div>

            {config.enabled && (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {t('hivePartitionPanel.columns')}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddColumn}
                        className="gap-1"
                      >
                        <Plus className="h-4 w-4" />
                        {t('hivePartitionPanel.addColumn')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('hivePartitionPanel.addColumnTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {config.columns.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('hivePartitionPanel.emptyColumns')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {config.columns.map((col) => (
                      <div
                        key={col.name || Math.random().toString()}
                        className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3"
                      >
                        <Input
                          placeholder={t('hivePartitionPanel.columnName')}
                          value={col.name}
                          onChange={(e) =>
                            onUpdateColumn(col.name, {
                              ...col,
                              name: e.target.value,
                            })
                          }
                          className="w-32 font-mono text-sm"
                        />
                        <Select
                          value={col.type}
                          onValueChange={(value) =>
                            onUpdateColumn(col.name, { ...col, type: value })
                          }
                        >
                          <SelectTrigger className="w-28 transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {HIVE_TYPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder={t('hivePartitionPanel.columnComment')}
                          value={col.comment}
                          onChange={(e) =>
                            onUpdateColumn(col.name, {
                              ...col,
                              comment: e.target.value,
                            })
                          }
                          className="flex-1 text-sm"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => onRemoveColumn(col.name)}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('hivePartitionPanel.removeTip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

HivePartitionPanel.displayName = 'HivePartitionPanel';
