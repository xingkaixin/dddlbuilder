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
import { Layers, Plus, X, Info, Calendar } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import type {
  MysqlPartitionType,
  MysqlPartitionConfig,
  PartitionDefinition,
} from '@ddlbuilder/shared-types';

const PARTITION_TYPE_INFO: Record<MysqlPartitionType, { label: string }> = {
  RANGE: {
    label: 'RANGE',
  },
  'RANGE COLUMNS': {
    label: 'RANGE COLUMNS',
  },
  LIST: {
    label: 'LIST',
  },
  'LIST COLUMNS': {
    label: 'LIST COLUMNS',
  },
  HASH: {
    label: 'HASH',
  },
  KEY: {
    label: 'KEY',
  },
};

interface PartitionPanelProps {
  config: MysqlPartitionConfig;
  availableFields: string[];
  onEnabledChange: (enabled: boolean) => void;
  onTypeChange: (type: MysqlPartitionType) => void;
  onColumnsChange: (columns: string[]) => void;
  onExpressionChange: (expression: string) => void;
  onPartitionCountChange: (count: number) => void;
  onAddPartition: (partition: PartitionDefinition) => void;
  onRemovePartition: (index: number) => void;
  onUpdatePartition: (index: number, partition: PartitionDefinition) => void;
  onGeneratePartitions: (preset: 'year' | 'month' | 'day') => void;
}

// 判断是否需要分区定义（RANGE/LIST 类型需要）
const needsPartitionDefinitions = (type: MysqlPartitionType): boolean => {
  return ['RANGE', 'RANGE COLUMNS', 'LIST', 'LIST COLUMNS'].includes(type);
};

// 判断是否需要分区数量（HASH/KEY 类型需要）
const needsPartitionCount = (type: MysqlPartitionType): boolean => {
  return ['HASH', 'KEY'].includes(type);
};

// 判断是否支持多列（COLUMNS 类型支持）
const supportsMultipleColumns = (type: MysqlPartitionType): boolean => {
  return ['RANGE COLUMNS', 'LIST COLUMNS'].includes(type);
};

// 判断是否支持表达式（HASH/KEY/RANGE 支持，COLUMNS 类型不支持）
const supportsExpression = (type: MysqlPartitionType): boolean => {
  return ['HASH', 'KEY', 'RANGE', 'LIST'].includes(type);
};

export const PartitionPanel = memo<PartitionPanelProps>(
  ({
    config,
    availableFields,
    onEnabledChange,
    onTypeChange,
    onColumnsChange,
    onExpressionChange,
    onPartitionCountChange,
    onAddPartition,
    onRemovePartition,
    onUpdatePartition,
    onGeneratePartitions,
  }) => {
    const { t } = useTranslation();

    const handleAddPartition = () => {
      const existingNames = new Set((config.partitions ?? []).map((partition) => partition.name));
      let nextIndex = (config.partitions?.length || 0) + 1;
      while (existingNames.has(`p${nextIndex}`)) nextIndex += 1;
      onAddPartition({
        name: `p${nextIndex}`,
        value: '',
      });
    };

    return (
      <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
        {/* Decorative gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

        <div className="relative p-4">
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <Layers className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{t('partitionPanel.title')}</p>
                <p className="mt-1 text-xs opacity-80">{t('partitionPanel.description')}</p>
              </div>
            </div>

            {/* Enable Partition Switch */}
            <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold">{t('partitionPanel.enable')}</Label>
                <p className="text-xs text-muted-foreground">{t('partitionPanel.enableDesc')}</p>
              </div>
              <Switch checked={config.enabled} onCheckedChange={onEnabledChange} />
            </div>

            {config.enabled && (
              <div className="space-y-6 animate-in slide-in-from-top-2 duration-200">
                {/* Partition Type Selection */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    {t('partitionPanel.type')}
                  </Label>
                  <Select
                    value={config.type}
                    onValueChange={(value) => onTypeChange(value as MysqlPartitionType)}
                  >
                    <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                      <SelectValue placeholder={t('partitionPanel.typePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PARTITION_TYPE_INFO) as MysqlPartitionType[]).map((type) => (
                        <SelectItem
                          key={type}
                          value={type}
                          className="transition-colors hover:bg-accent"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{PARTITION_TYPE_INFO[type].label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Type Description */}
                  <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{t(`partitionPanel.typeDesc.${config.type}`)}</span>
                  </div>
                </div>

                {/* Partition Column/Expression Selection */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    {t('partitionPanel.partitionKey')}
                    {supportsMultipleColumns(config.type) && (
                      <span className="text-xs font-normal text-muted-foreground">
                        ({t('partitionPanel.multiColumn')})
                      </span>
                    )}
                    {supportsExpression(config.type) && (
                      <span className="text-xs font-normal text-muted-foreground">
                        ({t('partitionPanel.expressionSupport')})
                      </span>
                    )}
                  </Label>

                  {/* Expression input for HASH/KEY/RANGE/LIST */}
                  {supportsExpression(config.type) && (
                    <div className="space-y-2">
                      <Input
                        placeholder={t('partitionPanel.expressionPlaceholder')}
                        value={config.expression || ''}
                        onChange={(e) => onExpressionChange(e.target.value)}
                        className="font-mono text-sm transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('partitionPanel.expressionHint')}
                      </p>
                    </div>
                  )}

                  {/* Divider when expression is supported */}
                  {supportsExpression(config.type) && !config.expression && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t" />
                      <span className="text-xs text-muted-foreground">
                        {t('partitionPanel.orSelectField')}
                      </span>
                      <div className="flex-1 border-t" />
                    </div>
                  )}

                  {/* Field selection (hidden when expression is used) */}
                  {!config.expression &&
                    (availableFields.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                        {t('partitionPanel.noFields')}
                      </div>
                    ) : supportsMultipleColumns(config.type) ? (
                      // Multi-column selection for COLUMNS types
                      <div className="flex flex-wrap gap-2">
                        {availableFields.map((field) => {
                          const isSelected = config.columns.includes(field);
                          return (
                            <button
                              key={field}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  onColumnsChange(config.columns.filter((c) => c !== field));
                                } else {
                                  onColumnsChange([...config.columns, field]);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-md text-sm font-mono transition-all duration-200 ${
                                isSelected
                                  ? 'bg-primary text-primary-foreground shadow-md'
                                  : 'bg-muted hover:bg-muted/80'
                              }`}
                            >
                              {field}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      // Single column selection for non-COLUMNS types
                      <Select
                        value={config.columns[0] || ''}
                        onValueChange={(value) => onColumnsChange([value])}
                      >
                        <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                          <SelectValue placeholder={t('partitionPanel.fieldPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableFields.map((field) => (
                            <SelectItem
                              key={field}
                              value={field}
                              className="transition-colors hover:bg-accent"
                            >
                              <span className="font-mono text-sm">{field}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ))}
                </div>

                {/* Partition Count (for HASH/KEY) */}
                {needsPartitionCount(config.type) && (
                  <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <Label className="text-sm font-semibold">
                      {t('partitionPanel.partitionCount')}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={1024}
                      value={config.partitionCount || 4}
                      onChange={(e) =>
                        onPartitionCountChange(Number.parseInt(e.target.value, 10) || 4)
                      }
                      className="w-32 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('partitionPanel.partitionCountHint')}
                    </p>
                  </div>
                )}

                {/* Partition Definitions (for RANGE/LIST) */}
                {needsPartitionDefinitions(config.type) && (
                  <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <Label className="text-sm font-semibold">
                        {t('partitionPanel.partitionDefs')}
                      </Label>
                      <div className="flex items-center gap-2">
                        {/* Quick generate buttons for RANGE */}
                        {config.type.startsWith('RANGE') && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground mr-1">
                              {t('partitionPanel.quick')}:
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onGeneratePartitions('year')}
                                  className="h-7 px-2 text-xs gap-1"
                                >
                                  <Calendar className="h-3 w-3" />
                                  {t('partitionPanel.byYear')}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('partitionPanel.byYearTip')}</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onGeneratePartitions('month')}
                                  className="h-7 px-2 text-xs"
                                >
                                  {t('partitionPanel.byMonth')}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('partitionPanel.byMonthTip')}</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onGeneratePartitions('day')}
                                  className="h-7 px-2 text-xs"
                                >
                                  {t('partitionPanel.byDay')}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('partitionPanel.byDayTip')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleAddPartition}
                              className="gap-1"
                            >
                              <Plus className="h-4 w-4" />
                              {t('partitionPanel.addPartition')}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('partitionPanel.addPartitionTip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>

                    {(!config.partitions || config.partitions.length === 0) && (
                      <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                        {t('partitionPanel.emptyDefs')}
                      </div>
                    )}

                    {config.partitions && config.partitions.length > 0 && (
                      <div className="space-y-2">
                        {config.partitions.map((partition, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3"
                          >
                            <Input
                              placeholder={t('partitionPanel.partitionName')}
                              value={partition.name}
                              onChange={(e) =>
                                onUpdatePartition(index, {
                                  ...partition,
                                  name: e.target.value,
                                })
                              }
                              className="w-28 font-mono text-sm"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {config.type.startsWith('RANGE')
                                ? t('partitionPanel.lessThan')
                                : t('partitionPanel.in')}
                            </span>
                            <Input
                              placeholder={
                                config.type.startsWith('RANGE')
                                  ? t('partitionPanel.rangeValuePlaceholder')
                                  : t('partitionPanel.listValuePlaceholder')
                              }
                              value={partition.value}
                              onChange={(e) =>
                                onUpdatePartition(index, {
                                  ...partition,
                                  value: e.target.value,
                                })
                              }
                              className="flex-1 font-mono text-sm"
                            />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onRemovePartition(index)}
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t('partitionPanel.removePartitionTip')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {config.type.startsWith('RANGE')
                        ? t('partitionPanel.rangeHint')
                        : t('partitionPanel.listHint')}
                    </p>
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
