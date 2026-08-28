import { renameEditorField } from '@/__tests__/utils/editorFields';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';

function resetPartitionStore() {
  useEditorStore.getState().resetPartition();
}

describe('partitionStore', () => {
  beforeEach(() => {
    resetPartitionStore();
  });

  it('应该在切换分区类型时清空分区定义与字段', () => {
    const state = useEditorStore.getState();

    state.addPartition({ id: 'p1', name: 'p1', value: '2024' });
    state.setPartitionColumns(['created_at']);
    state.setPartitionType('HASH');

    const current = useEditorStore.getState();
    expect(current.mysqlPartitionConfig.type).toBe('HASH');
    expect(current.mysqlPartitionConfig.partitions).toEqual([]);
    expect(current.mysqlPartitionConfig.columns).toEqual([]);
    expect(current.mysqlPartitionConfig.expression).toBeUndefined();
  });

  it('应该支持生成月分区并重置', () => {
    const state = useEditorStore.getState();

    state.generateRangePartitions('month');
    let current = useEditorStore.getState();
    expect(current.mysqlPartitionConfig.partitions?.length).toBe(13);
    expect(current.mysqlPartitionConfig.partitions?.[12].name).toBe('pmax');

    current.resetPartition();
    current = useEditorStore.getState();
    expect(current.mysqlPartitionConfig.enabled).toBe(false);
    expect(current.mysqlPartitionConfig.type).toBe('RANGE');
  });

  it('字段重命名时应同步分区字段与表达式', () => {
    const state = useEditorStore.getState();

    state.setMysqlPartitionConfig({
      enabled: true,
      type: 'RANGE',
      columns: ['dayofmonth(CREATED_AT)', 'tenant_id'],
      expression: 'YEAR(CREATED_AT)',
      partitionCount: 4,
      partitions: [],
    });

    renameEditorField('created_at', 'created_on');

    const current = useEditorStore.getState();
    expect(current.mysqlPartitionConfig.columns).toEqual(['dayofmonth(created_on)', 'tenant_id']);
    expect(current.mysqlPartitionConfig.expression).toBe('YEAR(created_on)');
  });

  it('历史分区表达式只跟随真实字段引用，删除最后一个引用后关闭分区', () => {
    useEditorStore.getState().setRows([
      { id: 'year', fieldName: 'year', fieldType: 'int', fieldComment: '', nullable: false },
      { id: 'date', fieldName: 'created_at', fieldType: 'date', fieldComment: '', nullable: false },
    ]);
    useEditorStore.getState().setMysqlPartitionConfig({
      enabled: true,
      type: 'RANGE',
      columns: ['YEAR(created_at)'],
      partitions: [],
    });
    useEditorStore.getState().handleRemoveRow(0, 1);
    expect(useEditorStore.getState().mysqlPartitionConfig).toMatchObject({
      enabled: true,
      columns: ['YEAR(created_at)'],
    });
    useEditorStore.getState().handleRemoveRow(0, 1);
    expect(useEditorStore.getState().mysqlPartitionConfig).toMatchObject({
      enabled: false,
      columns: [],
    });
  });
});
