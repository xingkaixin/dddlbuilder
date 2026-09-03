import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/__tests__/utils/test-utils';
import {
  TableBuilderContainer,
  type TableBuilderContainerProps,
} from '@/components/App/containers/TableBuilderContainer';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { useEditorStore } from '@/stores/editorStore';

vi.mock('@/components/App/TableConfig', () => ({
  TableConfig: () => null,
}));
vi.mock('@/components/App/DataTable', () => ({
  DataTable: () => <div data-testid="fields-panel" />,
}));
vi.mock('@/components/App/ViewDefinitionPanel', () => ({
  ViewDefinitionPanel: () => <div data-testid="view-panel" />,
}));
vi.mock('@/components/App/IndexPanel', () => ({
  IndexPanel: () => <div data-testid="indexes-panel" />,
}));
vi.mock('@/components/App/ForeignKeyPanel', () => ({
  ForeignKeyPanel: () => <div data-testid="foreign-keys-panel" />,
}));
vi.mock('@/components/App/AuthPanel', () => ({
  AuthPanel: () => <div data-testid="auth-panel" />,
}));
vi.mock('@/components/App/TableOptionsPanel', () => ({
  TableOptionsPanel: () => <div data-testid="misc-panel" />,
}));
vi.mock('@/components/App/ShardingPanel', () => ({
  ShardingPanel: () => <div data-testid="sharding-panel" />,
}));
vi.mock('@/components/App/PartitionPanel', () => ({
  PartitionPanel: () => <div data-testid="partition-panel" />,
}));
vi.mock('@/components/App/HivePartitionPanel', () => ({
  HivePartitionPanel: () => <div data-testid="hive-partition-panel" />,
}));

const noop = () => undefined;

function buildProps(): TableBuilderContainerProps {
  const state = useEditorStore.getState();

  return {
    tableConfigProps: {
      schemaName: state.schemaName,
      tableName: state.tableName,
      tableComment: state.tableComment,
      objectType: state.objectType,
      dbType: state.dbType,
      onSchemaNameChange: noop,
      onTableNameChange: noop,
      onTableCommentChange: noop,
      onObjectTypeChange: noop,
      onDbTypeChange: noop,
      onClearAll: noop,
    },
    tabsValue: state.activeTab,
    onTabsValueChange: state.setActiveTab,
    dataTableProps: {},
    viewDefinitionPanelProps: {
      definition: '',
      createOrReplace: true,
      onDefinitionChange: noop,
      onCreateOrReplaceChange: noop,
    },
    indexPanelProps: {},
    foreignKeyPanelProps: { availableFields: [] },
    authPanelProps: {
      authInput: '',
      authObjects: [],
      onAuthInputChange: noop,
      onAddAuthObject: noop,
      onRemoveAuthObject: noop,
    },
    tableOptionsPanelProps: {
      dbType: state.dbType,
      config: { enabled: false },
      onEnabledChange: noop,
      onEngineChange: noop,
      onCharsetChange: noop,
      onCollationChange: noop,
      onTablespaceChange: noop,
    },
    shardingPanelProps: {
      config: { mode: 'reference' },
      availableFields: [],
      onModeChange: noop,
      onDistributionColumnChange: noop,
    },
    partitionPanelProps: {
      config: { enabled: false, type: 'RANGE', columns: [] },
      availableFields: [],
      onEnabledChange: noop,
      onTypeChange: noop,
      onColumnsChange: noop,
      onExpressionChange: noop,
      onPartitionCountChange: noop,
      onAddPartition: noop,
      onRemovePartition: noop,
      onUpdatePartition: noop,
      onGeneratePartitions: noop,
    },
    hivePartitionPanelProps: {
      config: { enabled: false, columns: [] },
      onEnabledChange: noop,
      onAddColumn: noop,
      onRemoveColumn: noop,
      onUpdateColumn: noop,
      onClusteringChange: noop,
    },
  };
}

describe('TableBuilderContainer', () => {
  beforeEach(() => {
    useEditorStore.getState().resetDocument();
  });

  it('加载不支持当前标签的文档后显示可用面板', () => {
    const state = useEditorStore.getState();
    state.setDbType('postgresql-citus');
    state.setActiveTab('sharding');
    state.replaceDocument({
      ...toPersistedState(useEditorStore.getState()),
      dbType: 'hive',
    });

    expect(useEditorStore.getState().activeTab).toBe('fields');
    render(<TableBuilderContainer {...buildProps()} />);

    expect(screen.getByTestId('fields-panel')).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });
});
