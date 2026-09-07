import { memo, type ComponentProps, type ComponentType, type ReactNode } from 'react';
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
  type AppIconProps,
} from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEditorStore } from '@/stores';
import { getAvailableTabs, isBuilderTab, type BuilderTab } from '@/utils/tabUtils';
import { useTranslation } from 'react-i18next';
import { AuthPanel } from '../AuthPanel';
import { DataTable } from '../DataTable';
import { ForeignKeyPanel } from '../ForeignKeyPanel';
import { HivePartitionPanel } from '../HivePartitionPanel';
import { IndexPanel } from '../IndexPanel';
import { PartitionPanel } from '../PartitionPanel';
import { ShardingPanel } from '../ShardingPanel';
import type { TableConfig } from '../TableConfig';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { TableOptionsPanel } from '../TableOptionsPanel';
import { ViewDefinitionPanel } from '../ViewDefinitionPanel';

export interface TableBuilderContainerProps {
  tableConfigProps: ComponentProps<typeof TableConfig>;
  tabsValue: BuilderTab;
  onTabsValueChange: (value: BuilderTab) => void;
  dataTableProps: ComponentProps<typeof DataTable>;
  viewDefinitionPanelProps: ComponentProps<typeof ViewDefinitionPanel>;
  indexPanelProps: ComponentProps<typeof IndexPanel>;
  foreignKeyPanelProps: ComponentProps<typeof ForeignKeyPanel>;
  authPanelProps: ComponentProps<typeof AuthPanel>;
  tableOptionsPanelProps: ComponentProps<typeof TableOptionsPanel>;
  shardingPanelProps: ComponentProps<typeof ShardingPanel>;
  partitionPanelProps: ComponentProps<typeof PartitionPanel>;
  hivePartitionPanelProps: ComponentProps<typeof HivePartitionPanel>;
}

interface BuilderTabDefinition {
  value: BuilderTab;
  icon: ComponentType<AppIconProps>;
  label: string;
  badge?: ReactNode;
  panel: ReactNode;
}

const INDEX_STAT_BADGES = [
  {
    key: 'primary',
    icon: Key,
    className: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-200',
  },
  {
    key: 'unique',
    icon: Lock,
    className: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-200',
  },
  {
    key: 'normal',
    icon: Hash,
    className: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
] as const;

type IndexStats = Record<(typeof INDEX_STAT_BADGES)[number]['key'], number>;

function TabBadge({ children }: { children: ReactNode }) {
  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {children}
    </span>
  );
}

function tabBadge(value: number | string | null | undefined) {
  return value ? <TabBadge>{value}</TabBadge> : null;
}

function IndexStatsBadge({ stats }: { stats: IndexStats }) {
  return (
    <div className="ml-2 flex items-center gap-2">
      {INDEX_STAT_BADGES.map(({ key, icon: Icon, className }) =>
        stats[key] > 0 ? (
          <span
            key={key}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${className}`}
          >
            <Icon className="h-3 w-3" />
            {stats[key]}
          </span>
        ) : null,
      )}
    </div>
  );
}

export const TableBuilderContainer = memo(function TableBuilderContainer({
  tableConfigProps,
  tabsValue,
  onTabsValueChange,
  dataTableProps,
  viewDefinitionPanelProps,
  indexPanelProps,
  foreignKeyPanelProps,
  authPanelProps,
  tableOptionsPanelProps,
  shardingPanelProps,
  partitionPanelProps,
  hivePartitionPanelProps,
}: TableBuilderContainerProps) {
  const { t } = useTranslation();
  const { objectType, dbType } = tableConfigProps;

  const fieldCount = useEditorStore(
    (state) => state.rows.filter((row) => row.fieldName?.trim()).length,
  );
  const foreignKeyCount = useEditorStore((state) => state.foreignKeys.length);
  const indexes = useEditorStore((state) => state.indexes);
  const indexStats = indexes.reduce<IndexStats>(
    (acc, index) => {
      if (index.kind === 'primary') acc.primary += 1;
      else if (index.kind !== 'index') acc.unique += 1;
      else acc.normal += 1;
      return acc;
    },
    { primary: 0, unique: 0, normal: 0 },
  );

  const tabDefinitions: BuilderTabDefinition[] = [
    objectType === 'view'
      ? {
          value: 'fields',
          icon: Code2,
          label: t('builderTabs.viewSql'),
          panel: <ViewDefinitionPanel {...viewDefinitionPanelProps} />,
        }
      : {
          value: 'fields',
          icon: Columns3Cog,
          label: t('builderTabs.fields'),
          badge: tabBadge(fieldCount),
          panel: <DataTable {...dataTableProps} />,
        },
    {
      value: 'indexes',
      icon: Network,
      label: t('builderTabs.indexes'),
      badge: indexes.length > 0 && <IndexStatsBadge stats={indexStats} />,
      panel: <IndexPanel {...indexPanelProps} />,
    },
    {
      value: 'foreignKeys',
      icon: Link2,
      label: t('builderTabs.foreignKeys'),
      badge: tabBadge(foreignKeyCount),
      panel: <ForeignKeyPanel {...foreignKeyPanelProps} />,
    },
    {
      value: 'auth',
      icon: ShieldUser,
      label: t('builderTabs.auth'),
      badge: tabBadge(authPanelProps.authObjects.length),
      panel: <AuthPanel {...authPanelProps} />,
    },
    {
      value: 'misc',
      icon: SlidersHorizontal,
      label: t('builderTabs.misc'),
      badge: tabBadge(tableOptionsPanelProps.config.enabled ? t('builderTabs.enabled') : null),
      panel: <TableOptionsPanel {...tableOptionsPanelProps} />,
    },
    {
      value: 'sharding',
      icon: Share2,
      label: t('builderTabs.sharding'),
      badge: tabBadge(
        shardingPanelProps.config.mode === 'distributed'
          ? shardingPanelProps.config.distributionColumn
          : null,
      ),
      panel: <ShardingPanel {...shardingPanelProps} />,
    },
    {
      value: 'partition',
      icon: Layers,
      label: t('builderTabs.partition'),
      badge: tabBadge(partitionPanelProps.config.enabled ? partitionPanelProps.config.type : null),
      panel: <PartitionPanel {...partitionPanelProps} />,
    },
    {
      value: 'hive-partition',
      icon: Layers,
      label: t('builderTabs.hivePartition'),
      badge: tabBadge(
        hivePartitionPanelProps.config.enabled
          ? `${hivePartitionPanelProps.config.columns.length}`
          : null,
      ),
      panel: <HivePartitionPanel {...hivePartitionPanelProps} />,
    },
  ];
  const availableTabs = new Set(getAvailableTabs({ objectType, dbType }));
  const tabs = tabDefinitions.filter((tab) => availableTabs.has(tab.value));

  const advancedTabs = tabs.filter((tab) =>
    ['misc', 'sharding', 'partition', 'hive-partition'].includes(tab.value),
  );
  const primaryTabs = tabs.filter((tab) => !advancedTabs.includes(tab));
  const activeAdvancedTab = advancedTabs.find((tab) => tab.value === tabsValue);

  const handleTabValueChange = (value: string) => {
    if (isBuilderTab(value)) onTabsValueChange(value);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <Tabs value={tabsValue} onValueChange={handleTabValueChange} className="w-full">
        <div className="flex flex-wrap items-center gap-2 border-b">
          <TabsList className="h-9 max-w-full justify-start overflow-x-auto rounded-none bg-transparent p-0">
            {primaryTabs.map(({ value, icon: Icon, label, badge }) => (
              <TabsTrigger
                key={value}
                value={value}
                aria-label={label}
                className="h-9 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs after:hidden data-active:border-primary data-active:bg-transparent data-active:text-primary data-active:shadow-none"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {badge}
              </TabsTrigger>
            ))}
          </TabsList>
          {advancedTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t('builderTabs.advanced')}
                  variant="ghost"
                  size="sm"
                  className={`h-9 gap-1.5 rounded-none border-b-2 text-xs ${activeAdvancedTab ? 'border-primary text-primary' : 'border-transparent'}`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {activeAdvancedTab ? activeAdvancedTab.label : t('builderTabs.advanced')}
                  {advancedTabs.some((tab) => tab.badge) && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-primary"
                      aria-label={t('builderTabs.enabled')}
                    />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {advancedTabs.map(({ value, label, badge }) => (
                  <DropdownMenuItem key={value} onClick={() => onTabsValueChange(value)}>
                    {label}
                    {badge}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {tabs.map(({ value, panel }) => (
          <TabsContent
            key={value}
            value={value}
            aria-label={tabs.find((tab) => tab.value === value)?.label}
            className="mt-2"
          >
            {panel}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
});
