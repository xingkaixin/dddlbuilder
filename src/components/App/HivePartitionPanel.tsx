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
import { Layers, Plus, X, Grid3x3 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import type {
  HiveClusteringConfig,
  HivePartitionColumn,
  HivePartitionConfig,
} from '@/types';

const HIVE_TYPE_OPTIONS = [
  'STRING',
  'INT',
  'BIGINT',
  'DOUBLE',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
  'DECIMAL',
];

interface HivePartitionPanelProps {
  config: HivePartitionConfig;
  onEnabledChange: (enabled: boolean) => void;
  onAddColumn: (column: HivePartitionColumn) => void;
  onRemoveColumn: (index: number) => void;
  onUpdateColumn: (index: number, column: HivePartitionColumn) => void;
  onClusteringChange: (config: HiveClusteringConfig) => void;
}

export const HivePartitionPanel = memo<HivePartitionPanelProps>(
  ({
    config,
    onEnabledChange,
    onAddColumn,
    onRemoveColumn,
    onUpdateColumn,
    onClusteringChange,
  }) => {
    const { t } = useTranslation();

    const handleAddColumn = () => {
      onAddColumn({ name: '', type: 'STRING', comment: '' });
    };

    const clusteringConfig = config.clustering ?? {
      enabled: false,
      columns: [],
      bucketCount: 8,
    };

    const handleClusteringColumnAdd = () => {
      onClusteringChange({
        ...clusteringConfig,
        enabled: true,
        columns: [...clusteringConfig.columns, ''],
      });
    };

    const handleClusteringColumnUpdate = (index: number, value: string) => {
      const newColumns = [...clusteringConfig.columns];
      newColumns[index] = value;
      onClusteringChange({ ...clusteringConfig, columns: newColumns });
    };

    const handleClusteringColumnRemove = (index: number) => {
      const newColumns = clusteringConfig.columns.filter((_, i) => i !== index);
      onClusteringChange({
        ...clusteringConfig,
        columns: newColumns,
        enabled: newColumns.length > 0,
      });
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
                    {config.columns.map((col, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3"
                      >
                        <Input
                          placeholder={t('hivePartitionPanel.columnName')}
                          value={col.name}
                          onChange={(e) =>
                            onUpdateColumn(index, {
                              ...col,
                              name: e.target.value,
                            })
                          }
                          className="w-32 font-mono text-sm"
                        />
                        <Select
                          value={col.type}
                          onValueChange={(value) =>
                            onUpdateColumn(index, { ...col, type: value })
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
                            onUpdateColumn(index, {
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
                              onClick={() => onRemoveColumn(index)}
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

                {/* Clustering Section */}
                <div className="space-y-4 rounded-lg border border-dashed p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Grid3x3 className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-semibold">
                          {t('hivePartitionPanel.clustering.title')}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('hivePartitionPanel.clustering.description')}
                      </p>
                    </div>
                    <Switch
                      checked={clusteringConfig.enabled}
                      onCheckedChange={(checked) =>
                        onClusteringChange({
                          ...clusteringConfig,
                          enabled: checked,
                          columns:
                            checked && clusteringConfig.columns.length === 0
                              ? ['']
                              : clusteringConfig.columns,
                        })
                      }
                    />
                  </div>

                  {clusteringConfig.enabled && (
                    <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-muted-foreground">
                          {t('hivePartitionPanel.clustering.columns')}
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleClusteringColumnAdd}
                          className="gap-1 h-7 text-xs"
                        >
                          <Plus className="h-3 w-3" />
                          {t('hivePartitionPanel.clustering.addColumn')}
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {clusteringConfig.columns.map((col, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              placeholder={t(
                                'hivePartitionPanel.clustering.columnPlaceholder',
                              )}
                              value={col}
                              onChange={(e) =>
                                handleClusteringColumnUpdate(
                                  index,
                                  e.target.value,
                                )
                              }
                              className="flex-1 font-mono text-sm h-8"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleClusteringColumnRemove(index)
                              }
                              className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-3">
                        <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                          {t('hivePartitionPanel.clustering.bucketCount')}
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={clusteringConfig.bucketCount}
                          onChange={(e) =>
                            onClusteringChange({
                              ...clusteringConfig,
                              bucketCount: Math.max(
                                1,
                                parseInt(e.target.value, 10) || 1,
                              ),
                            })
                          }
                          className="w-24 h-8 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

HivePartitionPanel.displayName = 'HivePartitionPanel';
