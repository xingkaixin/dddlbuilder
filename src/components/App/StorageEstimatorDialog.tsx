import { memo } from 'react';
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
import type { DatabaseType, NormalizedField } from '@/types';
import { useStorageEstimation } from '@/hooks/useStorageEstimation';
import { Database, HardDrive, InfoIcon, PieChart, Layers } from 'lucide-react';

interface StorageEstimatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbType: DatabaseType;
  fields: NormalizedField[];
  storageFormat?: string;
}

export const StorageEstimatorDialog = memo<StorageEstimatorDialogProps>(
  ({ open, onOpenChange, dbType, fields, storageFormat }) => {
    const { estimateRows, setEstimateRows, result, rowSizeFormatted, totalSizeDisplay } =
      useStorageEstimation(dbType, fields, storageFormat);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <HardDrive className="h-6 w-6 text-primary" />
              存储容量估算器
            </DialogTitle>
            <DialogDescription>
              基于当前所选的数据库特性与字段配置，预估物理磁盘占用情况。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Summary Boxes */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col p-4 bg-primary/5 border border-primary/10 rounded-xl">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Layers className="h-4 w-4" />
                  <span>单行预估大小</span>
                </div>
                <div className="text-3xl font-bold text-primary">{rowSizeFormatted}</div>
              </div>
              <div className="flex flex-col p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <PieChart className="h-4 w-4" />
                  <span>总计预估大小</span>
                </div>
                <div className="text-3xl font-bold text-emerald-600">
                  <AnimatedNumber
                    key={totalSizeDisplay.unit}
                    value={totalSizeDisplay.value}
                    format={{ useGrouping: true, maximumFractionDigits: 2 }}
                  />
                  <span className="ml-1">{totalSizeDisplay.unit}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rows-input" className="text-sm font-medium">
                    预估承载数据量 (行)
                  </Label>
                  <span className="text-xs font-mono text-muted-foreground">
                    <AnimatedNumber
                      value={estimateRows}
                      format={{ useGrouping: true, maximumFractionDigits: 0 }}
                    />{' '}
                    行
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
            </div>

            {/* Explanations & Characteristics */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground mb-1">
                <Database className="h-4 w-4 text-primary" />
                <span>{result.dbName} 存储特性说明</span>
              </div>
              <div className="grid gap-2">
                {result.explanation.map((text, idx) => (
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

            <div className="text-[10px] text-muted-foreground italic border-t pt-2 mt-2">
              提示：此工具仅为逻辑估算，实际占用受文件系统碎片、索引页分裂、空隙、事务并发版本等复杂物理因素影响，结果仅供容量规划参考。
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);
StorageEstimatorDialog.displayName = 'StorageEstimatorDialog';
