import { memo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Share2, Database, GitBranch } from 'lucide-react';
import type { CitusTableMode, CitusShardingConfig } from '@/types';

interface ShardingPanelProps {
  config: CitusShardingConfig;
  availableFields: string[];
  onModeChange: (mode: CitusTableMode) => void;
  onDistributionColumnChange: (column: string | undefined) => void;
}

export const ShardingPanel = memo<ShardingPanelProps>(
  ({ config, availableFields, onModeChange, onDistributionColumnChange }) => {
    return (
      <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
        {/* Decorative gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

        <div className="relative p-4">
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              <Share2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Citus 分布式表配置</p>
                <p className="mt-1 text-xs opacity-80">
                  配置表的分片模式。副本表会复制到所有节点，适用于小型维度表；分片表会按指定字段分布到各节点，适用于大型数据表。
                </p>
              </div>
            </div>

            {/* Table Mode Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                表模式
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onModeChange('reference')}
                  className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all duration-200 hover:border-primary/50 ${
                    config.mode === 'reference'
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-muted hover:bg-muted/50'
                  }`}
                >
                  <Database
                    className={`h-8 w-8 transition-colors ${
                      config.mode === 'reference'
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <div className="text-center">
                    <div className="font-semibold">副本表</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Reference Table
                    </div>
                  </div>
                  {config.mode === 'reference' && (
                    <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-primary animate-pulse" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onModeChange('distributed')}
                  className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all duration-200 hover:border-primary/50 ${
                    config.mode === 'distributed'
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-muted hover:bg-muted/50'
                  }`}
                >
                  <GitBranch
                    className={`h-8 w-8 transition-colors ${
                      config.mode === 'distributed'
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <div className="text-center">
                    <div className="font-semibold">分片表</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Distributed Table
                    </div>
                  </div>
                  {config.mode === 'distributed' && (
                    <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-primary animate-pulse" />
                  )}
                </button>
              </div>
            </div>

            {/* Distribution Column Selection (only for distributed mode) */}
            {config.mode === 'distributed' && (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  分片字段
                  <span className="text-xs font-normal text-muted-foreground">
                    (必选)
                  </span>
                </Label>
                {availableFields.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                    请先在字段配置中添加字段，然后在此选择分片字段。
                  </div>
                ) : (
                  <Select
                    value={config.distributionColumn || ''}
                    onValueChange={(value) =>
                      onDistributionColumnChange(value || undefined)
                    }
                  >
                    <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                      <SelectValue placeholder="选择用于数据分片的字段..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map((field) => (
                        <SelectItem
                          key={field}
                          value={field}
                          className="transition-colors hover:bg-accent"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{field}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  选择一个字段作为数据分布的依据。通常选择用于 JOIN
                  操作或频繁过滤的字段，如 tenant_id、user_id 等。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
