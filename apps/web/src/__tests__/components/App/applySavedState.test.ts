import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { applySavedState } from '@/components/App/applySavedState';
import { useEditorStore } from '@/stores';

const state: PersistedState = {
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 0,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: 'grant_input',
  authObjects: ['reader'],
  citusShardingConfig: {
    mode: 'distributed',
    distributionColumn: 'tenant_id',
  },
  mysqlPartitionConfig: {
    enabled: true,
    type: 'HASH',
    columns: ['tenant_id'],
    partitionCount: 8,
  },
  tableMiscConfig: {
    enabled: true,
    engine: 'InnoDB',
  },
  fieldTableViewConfig: {
    freezeEnabled: false,
    freezeColumns: 0,
  },
};

describe('applySavedState', () => {
  it('一次通知内替换完整文档', () => {
    useEditorStore.getState().replaceDocument({ ...state, tableName: 'before' });
    const tableNames: string[] = [];
    const unsubscribe = useEditorStore.subscribe((current) => tableNames.push(current.tableName));

    applySavedState(state);
    unsubscribe();

    expect(tableNames).toEqual(['users']);
  });

  it('由一个入口应用并约束持久化状态', () => {
    applySavedState(state);

    expect(useEditorStore.getState()).toMatchObject({
      tableName: 'users',
      addCount: 1,
      fieldTableFreezeColumns: 0,
    });
    expect(useEditorStore.getState().rows).toEqual([]);
    expect(useEditorStore.getState()).toMatchObject({
      authInput: 'grant_input',
      authObjects: ['reader'],
    });
    expect(useEditorStore.getState().citusShardingConfig).toEqual(state.citusShardingConfig);
    expect(useEditorStore.getState().mysqlPartitionConfig).toEqual(state.mysqlPartitionConfig);
    expect(useEditorStore.getState().tableMiscConfig).toEqual(state.tableMiscConfig);
  });

  it('缺省可选配置时恢复各自的默认值', () => {
    applySavedState(state);
    applySavedState({
      ...state,
      citusShardingConfig: undefined,
      mysqlPartitionConfig: undefined,
      tableMiscConfig: undefined,
      fieldTableViewConfig: undefined,
    });

    expect(useEditorStore.getState()).toMatchObject({
      fieldTableFreezeEnabled: false,
      fieldTableFreezeColumns: 3,
    });
    expect(useEditorStore.getState().citusShardingConfig).toEqual({
      mode: 'reference',
      distributionColumn: undefined,
    });
    expect(useEditorStore.getState().mysqlPartitionConfig).toMatchObject({
      enabled: false,
      type: 'RANGE',
    });
    expect(useEditorStore.getState().tableMiscConfig).toMatchObject({
      enabled: false,
      engine: '',
    });
  });

  it('替换文档时统一限制所有数值配置', () => {
    applySavedState({
      ...state,
      addCount: 1_000_000,
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: ['tenant_id'],
        partitionCount: -3,
      },
      tableMiscConfig: { enabled: true, fillfactor: -50, pctfree: 500, initrans: 0 },
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 100 },
    });

    expect(useEditorStore.getState()).toMatchObject({
      addCount: 100,
      mysqlPartitionConfig: { partitionCount: 1 },
      tableMiscConfig: { fillfactor: 10, pctfree: 99, initrans: 1 },
      fieldTableFreezeColumns: 8,
    });
  });
});
