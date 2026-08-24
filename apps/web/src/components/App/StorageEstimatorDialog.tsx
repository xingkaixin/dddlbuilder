import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AnimatedNumber } from '@/components/ui/animated-number';
import type { DatabaseType, IndexDefinition, NormalizedField } from '@ddlbuilder/shared-types';
import { useStorageEstimation } from '@/hooks/useStorageEstimation';
import {
  Database,
  HardDrive,
  InfoIcon,
  BarChart3,
  Layers,
  GitBranch,
  Zap,
} from '@/components/icons';

interface StorageEstimatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbType: DatabaseType;
  fields: NormalizedField[];
  indexes?: IndexDefinition[];
  storageFormat?: string;
}

interface SizeDisplay {
  value: number;
  unit: string;
}

function formatSizeDisplay(bytes: number): SizeDisplay {
  if (bytes === 0) return { value: 0, unit: 'B' };
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return { value: Number.parseFloat((bytes / k ** i).toFixed(2)), unit: units[i] };
}

function formatSizeText(bytes: number): string {
  const display = formatSizeDisplay(bytes);
  return `${display.value} ${display.unit}`;
}

interface BreakdownCardProps {
  icon: React.ReactNode;
  label: string;
  bytes: number;
  colorClass: string;
}

function BreakdownCard({ icon, label, bytes, colorClass }: BreakdownCardProps) {
  const display = formatSizeDisplay(bytes);
  return (
    <div className={`flex flex-col p-4 rounded-xl border ${colorClass}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold`}>
        <AnimatedNumber
          key={display.unit}
          value={display.value}
          format={{ useGrouping: true, maximumFractionDigits: 2 }}
        />
        <span className="ml-1 text-lg">{display.unit}</span>
      </div>
    </div>
  );
}

export const StorageEstimatorDialog = memo<StorageEstimatorDialogProps>(
  ({ open, onOpenChange, dbType, fields, indexes = [], storageFormat }) => {
    const { t } = useTranslation();
    const {
      estimateRows,
      setEstimateRows,
      breakdown,
      result,
      rawDataBytes,
      indexBytes,
      redundancyBytes,
      totalSizeDisplay,
    } = useStorageEstimation(dbType, fields, indexes, storageFormat);
    const dataExplanation = [
      t('storageEstimator.explanations.rowOverhead', {
        size: formatSizeText(result.rowOverhead),
      }),
      t('storageEstimator.explanations.fieldData', {
        size: formatSizeText(result.dataSize),
      }),
      t('storageEstimator.explanations.rowTotal', {
        size: formatSizeText(result.totalRowSize),
      }),
    ];
    const indexExplanation =
      dbType === 'hive'
        ? [t('storageEstimator.explanations.hiveIndexes')]
        : indexes.length === 0
          ? [t('storageEstimator.explanations.noIndexes')]
          : [
              t('storageEstimator.explanations.indexAverage', {
                count: indexes.length,
                size: formatSizeText(breakdown.indexPerRow),
              }),
              t(
                breakdown.clusteredIndexes
                  ? 'storageEstimator.explanations.clusteredIndexes'
                  : 'storageEstimator.explanations.independentIndexes',
              ),
            ];
    const redundancyExplanation =
      dbType === 'hive'
        ? [t('storageEstimator.explanations.hiveRedundancy')]
        : [
            t('storageEstimator.explanations.redundancyRate', {
              rate: Math.round(breakdown.redundancyRate * 100),
            }),
            t('storageEstimator.explanations.redundancyBasis'),
          ];

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <HardDrive className="h-6 w-6 text-primary" />
              {t('storageEstimator.title')}
            </DialogTitle>
            <DialogDescription>{t('storageEstimator.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Row count input */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="rows-input" className="text-sm font-medium">
                  {t('storageEstimator.estimatedRows')}
                </Label>
                <span className="text-xs font-mono text-muted-foreground">
                  <AnimatedNumber
                    value={estimateRows}
                    format={{ useGrouping: true, maximumFractionDigits: 0 }}
                  />{' '}
                  {t('storageEstimator.rowsUnit')}
                </span>
              </div>
              <div className="flex gap-4 items-center">
                <input
                  type="range"
                  id="rows-slider"
                  min="1000"
                  max="10000000"
                  step="1000"
                  value={estimateRows}
                  onChange={(e) => setEstimateRows(parseInt(e.target.value, 10))}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <Input
                  id="rows-input"
                  type="number"
                  value={estimateRows}
                  onChange={(e) => setEstimateRows(parseInt(e.target.value, 10) || 0)}
                  className="w-32 h-9 text-right font-mono"
                />
              </div>
            </div>

            {/* Grand total */}
            <div className="flex items-center justify-between p-4 bg-violet-500/5 border border-violet-500/20 rounded-xl">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <BarChart3 className="h-4 w-4 text-violet-500" />
                <span>{t('storageEstimator.total')}</span>
              </div>
              <div className="text-3xl font-bold text-violet-600">
                <AnimatedNumber
                  key={totalSizeDisplay.unit}
                  value={totalSizeDisplay.value}
                  format={{ useGrouping: true, maximumFractionDigits: 2 }}
                />
                <span className="ml-1">{totalSizeDisplay.unit}</span>
              </div>
            </div>

            {/* Breakdown: three cards */}
            <div className="grid grid-cols-3 gap-3">
              <BreakdownCard
                icon={<Layers className="h-4 w-4" />}
                label={t('storageEstimator.rawData')}
                bytes={rawDataBytes}
                colorClass="bg-primary/5 border-primary/10"
              />
              <BreakdownCard
                icon={<GitBranch className="h-4 w-4" />}
                label={t('storageEstimator.indexStorage')}
                bytes={indexBytes}
                colorClass="bg-emerald-500/5 border-emerald-500/10"
              />
              <BreakdownCard
                icon={<Zap className="h-4 w-4" />}
                label={t('storageEstimator.redundancy')}
                bytes={redundancyBytes}
                colorClass="bg-amber-500/5 border-amber-500/10"
              />
            </div>

            {/* Explanations */}
            <div className="space-y-4">
              {/* Data */}
              <ExplainSection
                icon={<Database className="h-4 w-4 text-primary" />}
                title={t('storageEstimator.dataFeatures', { database: result.dbName })}
                items={dataExplanation}
              />

              {/* Index */}
              <ExplainSection
                icon={<GitBranch className="h-4 w-4 text-emerald-600" />}
                title={t('storageEstimator.indexExplanation')}
                items={indexExplanation}
              />

              {/* Redundancy */}
              <ExplainSection
                icon={<Zap className="h-4 w-4 text-amber-600" />}
                title={t('storageEstimator.redundancyExplanation')}
                items={redundancyExplanation}
              />
            </div>

            <div className="text-[10px] text-muted-foreground italic border-t pt-2 mt-2">
              {t('storageEstimator.disclaimer')}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);
StorageEstimatorDialog.displayName = 'StorageEstimatorDialog';

interface ExplainSectionProps {
  icon: React.ReactNode;
  title: string;
  items: string[];
}

function ExplainSection({ icon, title, items }: ExplainSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <div className="grid gap-1.5">
        {items.map((text, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/20 p-2.5 rounded-md border border-border/50"
          >
            <InfoIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
