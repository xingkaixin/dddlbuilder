import { memo, useMemo } from 'react';
import { Settings2, Info } from 'lucide-react';
import type { DatabaseType, TableMiscConfig } from '@/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  supportsEngineOption,
  supportsCharsetOption,
  supportsCollationOption,
  supportsTablespaceOption,
} from '@/utils/tableOptions';

const DEFAULT_OPTION_VALUE = 'default';

const ENGINE_OPTIONS = ['InnoDB', 'MyISAM', 'MEMORY', 'ARCHIVE', 'CSV'];
const CHARSET_OPTIONS = ['utf8mb4', 'utf8', 'latin1', 'gbk', 'big5'];
const COLLATION_OPTIONS = [
  'utf8mb4_0900_ai_ci',
  'utf8mb4_0900_bin',
  'utf8mb4_general_ci',
  'utf8mb4_unicode_ci',
  'utf8mb4_bin',
];

interface TableOptionsPanelProps {
  dbType: DatabaseType;
  config: TableMiscConfig;
  onEnabledChange: (enabled: boolean) => void;
  onEngineChange: (engine: string) => void;
  onCharsetChange: (charset: string) => void;
  onCollationChange: (collation: string) => void;
  onTablespaceChange: (tablespace: string) => void;
}

export const TableOptionsPanel = memo<TableOptionsPanelProps>(
  ({
    dbType,
    config,
    onEnabledChange,
    onEngineChange,
    onCharsetChange,
    onCollationChange,
    onTablespaceChange,
  }) => {
    const supportsEngine = supportsEngineOption(dbType);
    const supportsCharset = supportsCharsetOption(dbType);
    const supportsCollation = supportsCollationOption(dbType);
    const supportsTablespace = supportsTablespaceOption(dbType);
    const hasAnyOption =
      supportsEngine ||
      supportsCharset ||
      supportsCollation ||
      supportsTablespace;

    const disabled = !config.enabled;
    const effectiveEngine = config.engine || DEFAULT_OPTION_VALUE;
    const effectiveCharset = config.charset || DEFAULT_OPTION_VALUE;
    const effectiveCollation = config.collation || DEFAULT_OPTION_VALUE;

    const infoText = useMemo(() => {
      if (!hasAnyOption) {
        return '当前数据库暂无可配置的杂项项';
      }
      return '开启后才会在 DDL 中生成对应配置';
    }, [hasAnyOption]);

    return (
      <div className="relative group rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

        <div className="relative p-4 space-y-6">
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
            <Settings2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">表级杂项配置</p>
              <p className="mt-1 text-xs opacity-80">{infoText}</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-dashed p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">启用杂项设置</Label>
              <p className="text-xs text-muted-foreground">
                未开启时不会写入 DDL
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={onEnabledChange}
            />
          </div>

          {!hasAnyOption ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
              当前数据库暂不支持引擎、字符集、排序规则或表空间配置。
            </div>
          ) : (
            <div className="space-y-5">
              {(supportsEngine || supportsCharset || supportsCollation) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {supportsEngine && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">表引擎</Label>
                      <Select
                        value={effectiveEngine}
                        onValueChange={(value) =>
                          onEngineChange(
                            value === DEFAULT_OPTION_VALUE ? '' : value,
                          )
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                          <SelectValue placeholder="选择引擎..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DEFAULT_OPTION_VALUE}>
                            默认
                          </SelectItem>
                          {ENGINE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {supportsCharset && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">字符集</Label>
                      <Select
                        value={effectiveCharset}
                        onValueChange={(value) =>
                          onCharsetChange(
                            value === DEFAULT_OPTION_VALUE ? '' : value,
                          )
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                          <SelectValue placeholder="选择字符集..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DEFAULT_OPTION_VALUE}>
                            默认
                          </SelectItem>
                          {CHARSET_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {supportsCollation && (
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-sm font-semibold">排序规则</Label>
                      <Select
                        value={effectiveCollation}
                        onValueChange={(value) =>
                          onCollationChange(
                            value === DEFAULT_OPTION_VALUE ? '' : value,
                          )
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
                          <SelectValue placeholder="选择排序规则..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DEFAULT_OPTION_VALUE}>
                            默认
                          </SelectItem>
                          {COLLATION_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {supportsTablespace && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">表空间</Label>
                  <Input
                    placeholder="例如：ts_data"
                    value={config.tablespace || ''}
                    onChange={(event) => onTablespaceChange(event.target.value)}
                    disabled={disabled}
                    className="font-mono text-sm transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}

              {disabled && (
                <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>当前为关闭状态，配置不会写入 DDL。</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);

TableOptionsPanel.displayName = 'TableOptionsPanel';
