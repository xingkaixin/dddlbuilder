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
import { useFieldStore, useForeignKeyStore, useIndexStore } from '@/stores';
import { isBuilderTab, isTabAvailable, type BuilderTab } from '@/utils/tabUtils';
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
    <span className="ml-1 hidden items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary 2xl:inline-flex">
      {children}
    </span>
  );
}

function tabBadge(value: number | string | null | undefined) {
  return value ? <TabBadge>{value}</TabBadge> : null;
}

function IndexStatsBadge({ stats }: { stats: IndexStats }) {
  return (
    <div className="ml-2 hidden items-center gap-2 2xl:flex">
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

  const fieldCount = useFieldStore(
    (state) => state.rows.filter((row) => row.fieldName?.trim()).length,
  );
  const foreignKeyCount = useForeignKeyStore((state) => state.foreignKeys.length);
  const indexes = useIndexStore((state) => state.indexes);
  const indexStats = indexes.reduce<IndexStats>(
    (acc, index) => {
      if (index.isPrimary) acc.primary += 1;
      else if (index.unique) acc.unique += 1;
      else acc.normal += 1;
      return acc;
    },
    { primary: 0, unique: 0, normal: 0 },
  );

  const isTable = objectType === 'table';
  const showTab = (tab: BuilderTab) => isTable && isTabAvailable(tab, dbType);

  const tabCandidates: Array<BuilderTabDefinition | false> = [
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
    showTab('indexes') && {
      value: 'indexes',
      icon: Network,
      label: t('builderTabs.indexes'),
      badge: indexes.length > 0 && <IndexStatsBadge stats={indexStats} />,
      panel: <IndexPanel {...indexPanelProps} />,
    },
    showTab('foreignKeys') && {
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
    showTab('misc') && {
      value: 'misc',
      icon: SlidersHorizontal,
      label: t('builderTabs.misc'),
      badge: tabBadge(tableOptionsPanelProps.config.enabled ? t('builderTabs.enabled') : null),
      panel: <TableOptionsPanel {...tableOptionsPanelProps} />,
    },
    showTab('sharding') && {
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
    showTab('partition') && {
      value: 'partition',
      icon: Layers,
      label: t('builderTabs.partition'),
      badge: tabBadge(partitionPanelProps.config.enabled ? partitionPanelProps.config.type : null),
      panel: <PartitionPanel {...partitionPanelProps} />,
    },
    showTab('hive-partition') && {
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
  const tabs = tabCandidates.filter((tab): tab is BuilderTabDefinition => tab !== false);

  const handleTabValueChange = (value: string) => {
    if (isBuilderTab(value)) onTabsValueChange(value);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <TableConfig {...tableConfigProps} />

      <Tabs value={tabsValue} onValueChange={handleTabValueChange} className="w-full">
        <TabsList className="inline-flex h-auto max-w-full flex-wrap justify-start gap-1 [&>*]:after:hidden sm:flex-nowrap sm:gap-0 sm:overflow-x-auto sm:whitespace-nowrap sm:[&>*]:after:block [&>*]:shrink-0">
          {tabs.map(({ value, icon: Icon, label, badge }) => (
            <TabsTrigger key={value} value={value} className="gap-1.5 px-2.5 text-xs">
              <Icon className="h-3.5 w-3.5" />
              {label}
              {badge}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map(({ value, panel }) => (
          <TabsContent key={value} value={value} className="mt-4">
            {panel}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
});
