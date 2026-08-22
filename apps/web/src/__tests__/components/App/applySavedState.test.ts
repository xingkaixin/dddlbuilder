import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { applySavedState } from '@/components/App/applySavedState';
import {
  useAppStore,
  useAuthStore,
  useEditorStore,
  useFieldStore,
  usePartitionStore,
  useShardingStore,
  useTableOptionsStore,
} from '@/stores';

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
    expect(useAppStore).toBe(useFieldStore);
  });

  it('由一个入口无损应用已经解码的持久化状态', () => {
    applySavedState(state);

    expect(useAppStore.getState()).toMatchObject({
      tableName: 'users',
      addCount: 0,
      fieldTableFreezeColumns: 0,
    });
    expect(useFieldStore.getState().rows).toEqual([]);
    expect(useAuthStore.getState()).toMatchObject({
      authInput: 'grant_input',
      authObjects: ['reader'],
    });
    expect(useShardingStore.getState().citusShardingConfig).toEqual(state.citusShardingConfig);
    expect(usePartitionStore.getState().mysqlPartitionConfig).toEqual(state.mysqlPartitionConfig);
    expect(useTableOptionsStore.getState().tableMiscConfig).toEqual(state.tableMiscConfig);
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

    expect(useAppStore.getState()).toMatchObject({
      fieldTableFreezeEnabled: false,
      fieldTableFreezeColumns: 3,
    });
    expect(useShardingStore.getState().citusShardingConfig).toEqual({
      mode: 'reference',
      distributionColumn: undefined,
    });
    expect(usePartitionStore.getState().mysqlPartitionConfig).toMatchObject({
      enabled: false,
      type: 'RANGE',
    });
    expect(useTableOptionsStore.getState().tableMiscConfig).toMatchObject({
      enabled: false,
      engine: '',
    });
  });
});
