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
  Link2,
  Code2,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import { AuthPanel } from '../AuthPanel';
import { DataTable } from '../DataTable';
import { ForeignKeyPanel } from '../ForeignKeyPanel';
import { HivePartitionPanel } from '../HivePartitionPanel';
import { IndexPanel } from '../IndexPanel';
import { PartitionPanel } from '../PartitionPanel';
import { ShardingPanel } from '../ShardingPanel';
import { TableConfig } from '../TableConfig';
import { TableOptionsPanel } from '../TableOptionsPanel';
import { ViewDefinitionPanel } from '../ViewDefinitionPanel';

interface TableBuilderContainerProps {
  tableConfigProps: ComponentProps<typeof TableConfig>;
  objectType?: 'table' | 'view';
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
  showIndexTab: boolean;
  showForeignKeyTab: boolean;
  foreignKeysLength: number;
  showShardingTab: boolean;
  shardingBadgeText?: string | null;
  showPartitionTab: boolean;
  partitionBadgeText?: string | null;
  showHivePartitionTab: boolean;
  hivePartitionBadgeText?: string | null;
  dataTableProps: ComponentProps<typeof DataTable>;
  indexPanelProps: ComponentProps<typeof IndexPanel>;
  foreignKeyPanelProps: ComponentProps<typeof ForeignKeyPanel>;
  authPanelProps: ComponentProps<typeof AuthPanel>;
  tableOptionsPanelProps: ComponentProps<typeof TableOptionsPanel>;
  viewDefinitionPanelProps?: ComponentProps<typeof ViewDefinitionPanel>;
  shardingPanelProps?: ComponentProps<typeof ShardingPanel>;
  partitionPanelProps?: ComponentProps<typeof PartitionPanel>;
  hivePartitionPanelProps?: ComponentProps<typeof HivePartitionPanel>;
}

export function TableBuilderContainer({
  tableConfigProps,
  objectType = 'table',
  tabsValue,
  onTabsValueChange,
  filledRowCount,
  indexesLength,
  indexStats,
  authObjectsLength,
  miscEnabled,
  showIndexTab,
  showForeignKeyTab,
  foreignKeysLength,
  showShardingTab,
  shardingBadgeText,
  showPartitionTab,
  partitionBadgeText,
  showHivePartitionTab,
  hivePartitionBadgeText,
  dataTableProps,
  indexPanelProps,
  foreignKeyPanelProps,
  authPanelProps,
  tableOptionsPanelProps,
  viewDefinitionPanelProps,
  shardingPanelProps,
  partitionPanelProps,
  hivePartitionPanelProps,
}: TableBuilderContainerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <TableConfig {...tableConfigProps} />

      <Tabs value={tabsValue} onValueChange={onTabsValueChange} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap gap-1 [&>*]:after:hidden sm:flex-nowrap sm:gap-0 sm:overflow-x-auto sm:whitespace-nowrap sm:[&>*]:after:block [&>*]:shrink-0">
          <TabsTrigger value="fields" className="gap-2">
            {objectType === 'view' ? (
              <>
                <Code2 className="h-4 w-4" />
                {t('builderTabs.viewSql')}
              </>
            ) : (
              <>
                <Columns3Cog className="h-4 w-4" />
                {t('builderTabs.fields')}
                {filledRowCount > 0 && (
                  <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                    {filledRowCount}
                  </span>
                )}
              </>
            )}
          </TabsTrigger>
          {objectType === 'table' && showIndexTab && (
            <TabsTrigger value="indexes" className="gap-2">
              <Network className="h-4 w-4" />
              {t('builderTabs.indexes')}
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
          )}
          {objectType === 'table' && showForeignKeyTab && (
            <TabsTrigger value="foreignKeys" className="gap-2">
              <Link2 className="h-4 w-4" />
              {t('builderTabs.foreignKeys')}
              {foreignKeysLength > 0 && (
                <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                  {foreignKeysLength}
                </span>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="auth" className="gap-2">
            <ShieldUser className="h-4 w-4" />
            {t('builderTabs.auth')}
            {authObjectsLength > 0 && (
              <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                {authObjectsLength}
              </span>
            )}
          </TabsTrigger>
          {objectType === 'table' && (
            <TabsTrigger value="misc" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              {t('builderTabs.misc')}
              {miscEnabled && (
                <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                  {t('builderTabs.enabled')}
                </span>
              )}
            </TabsTrigger>
          )}
          {objectType === 'table' && showShardingTab && (
            <TabsTrigger value="sharding" className="gap-2">
              <Share2 className="h-4 w-4" />
              {t('builderTabs.sharding')}
              {shardingBadgeText && (
                <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                  {shardingBadgeText}
                </span>
              )}
            </TabsTrigger>
          )}
          {objectType === 'table' && showPartitionTab && (
            <TabsTrigger value="partition" className="gap-2">
              <Layers className="h-4 w-4" />
              {t('builderTabs.partition')}
              {partitionBadgeText && (
                <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                  {partitionBadgeText}
                </span>
              )}
            </TabsTrigger>
          )}
          {objectType === 'table' && showHivePartitionTab && (
            <TabsTrigger value="hive-partition" className="gap-2">
              <Layers className="h-4 w-4" />
              {t('builderTabs.hivePartition')}
              {hivePartitionBadgeText && (
                <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
                  {hivePartitionBadgeText}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="fields" className="mt-4">
          {objectType === 'view' && viewDefinitionPanelProps ? (
            <ViewDefinitionPanel {...viewDefinitionPanelProps} />
          ) : (
            <DataTable {...dataTableProps} />
          )}
        </TabsContent>
        {objectType === 'table' && showIndexTab && (
          <TabsContent value="indexes" className="mt-4">
            <IndexPanel {...indexPanelProps} />
          </TabsContent>
        )}
        {objectType === 'table' && showForeignKeyTab && (
          <TabsContent value="foreignKeys" className="mt-4">
            <ForeignKeyPanel {...foreignKeyPanelProps} />
          </TabsContent>
        )}
        <TabsContent value="auth" className="mt-4">
          <AuthPanel {...authPanelProps} />
        </TabsContent>
        {objectType === 'table' && (
          <TabsContent value="misc" className="mt-4">
            <TableOptionsPanel {...tableOptionsPanelProps} />
          </TabsContent>
        )}
        {objectType === 'table' && showShardingTab && shardingPanelProps && (
          <TabsContent value="sharding" className="mt-4">
            <ShardingPanel {...shardingPanelProps} />
          </TabsContent>
        )}
        {objectType === 'table' && showPartitionTab && partitionPanelProps && (
          <TabsContent value="partition" className="mt-4">
            <PartitionPanel {...partitionPanelProps} />
          </TabsContent>
        )}
        {objectType === 'table' && showHivePartitionTab && hivePartitionPanelProps && (
          <TabsContent value="hive-partition" className="mt-4">
            <HivePartitionPanel {...hivePartitionPanelProps} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
