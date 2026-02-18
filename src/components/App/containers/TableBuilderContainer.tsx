import type { ComponentProps } from 'react';
import {
  Columns3Cog,
  Network,
  ShieldUser,
  Key,
  Lock,
  Hash,
  Share2,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthPanel } from '../AuthPanel';
import { DataTable } from '../DataTable';
import { IndexPanel } from '../IndexPanel';
import { PartitionPanel } from '../PartitionPanel';
import { ShardingPanel } from '../ShardingPanel';
import { TableConfig } from '../TableConfig';
import { TableOptionsPanel } from '../TableOptionsPanel';

interface TableBuilderContainerProps {
  tableConfigProps: ComponentProps<typeof TableConfig>;
  tabsValue: string;
  onTabsValueChange: (value: string) => void;
  filledRowCount: number;
  indexesLength: number;
  indexStats: {
    primary: number;
    unique: number;
    normal: number;
  };
  authObjectsLength: number;
  miscEnabled: boolean;
  showShardingTab: boolean;
  shardingBadgeText?: string | null;
  showPartitionTab: boolean;
  partitionBadgeText?: string | null;
  dataTableProps: ComponentProps<typeof DataTable>;
  indexPanelProps: ComponentProps<typeof IndexPanel>;
  authPanelProps: ComponentProps<typeof AuthPanel>;
  tableOptionsPanelProps: ComponentProps<typeof TableOptionsPanel>;
  shardingPanelProps?: ComponentProps<typeof ShardingPanel>;
  partitionPanelProps?: ComponentProps<typeof PartitionPanel>;
}

export function TableBuilderContainer({
  tableConfigProps,
  tabsValue,
  onTabsValueChange,
  filledRowCount,
  indexesLength,
  indexStats,
  authObjectsLength,
  miscEnabled,
  showShardingTab,
  shardingBadgeText,
  showPartitionTab,
  partitionBadgeText,
  dataTableProps,
  indexPanelProps,
  authPanelProps,
  tableOptionsPanelProps,
  shardingPanelProps,
  partitionPanelProps,
}: TableBuilderContainerProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <TableConfig {...tableConfigProps} />

      <Tabs
        value={tabsValue}
        onValueChange={onTabsValueChange}
        className="w-full"
      >
        <TabsList className="flex h-auto w-full flex-wrap gap-1 [&>*]:after:hidden sm:flex-nowrap sm:gap-0 sm:overflow-x-auto sm:whitespace-nowrap sm:[&>*]:after:block [&>*]:shrink-0">
          <TabsTrigger value="fields" className="gap-2">
            <Columns3Cog className="h-4 w-4" />
            字段配置
            {filledRowCount > 0 && (
              <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                {filledRowCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="indexes" className="gap-2">
            <Network className="h-4 w-4" />
            索引配置
            {indexesLength > 0 && (
              <div className="ml-2 hidden items-center gap-2 2xl:flex">
                {indexStats.primary > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600 dark:bg-orange-900/40 dark:text-orange-200">
                    <Key className="h-3 w-3" />
                    {indexStats.primary}
                  </span>
                )}
                {indexStats.unique > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-900/40 dark:text-blue-200">
                    <Lock className="h-3 w-3" />
                    {indexStats.unique}
                  </span>
                )}
                {indexStats.normal > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-200">
                    <Hash className="h-3 w-3" />
                    {indexStats.normal}
                  </span>
                )}
              </div>
            )}
          </TabsTrigger>
          <TabsTrigger value="auth" className="gap-2">
            <ShieldUser className="h-4 w-4" />
            授权配置
            {authObjectsLength > 0 && (
              <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                {authObjectsLength}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="misc" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            杂项设置
            {miscEnabled && (
              <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                已启用
              </span>
            )}
          </TabsTrigger>
          {showShardingTab && (
            <TabsTrigger value="sharding" className="gap-2">
              <Share2 className="h-4 w-4" />
              分片配置
              {shardingBadgeText && (
                <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                  {shardingBadgeText}
                </span>
              )}
            </TabsTrigger>
          )}
          {showPartitionTab && (
            <TabsTrigger value="partition" className="gap-2">
              <Layers className="h-4 w-4" />
              分区配置
              {partitionBadgeText && (
                <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                  {partitionBadgeText}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="fields" className="mt-4">
          <DataTable {...dataTableProps} />
        </TabsContent>
        <TabsContent value="indexes" className="mt-4">
          <IndexPanel {...indexPanelProps} />
        </TabsContent>
        <TabsContent value="auth" className="mt-4">
          <AuthPanel {...authPanelProps} />
        </TabsContent>
        <TabsContent value="misc" className="mt-4">
          <TableOptionsPanel {...tableOptionsPanelProps} />
        </TabsContent>
        {showShardingTab && shardingPanelProps && (
          <TabsContent value="sharding" className="mt-4">
            <ShardingPanel {...shardingPanelProps} />
          </TabsContent>
        )}
        {showPartitionTab && partitionPanelProps && (
          <TabsContent value="partition" className="mt-4">
            <PartitionPanel {...partitionPanelProps} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
