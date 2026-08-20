import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  applyBlueprintToState,
  createBlueprintFromState,
  createTableTemplate,
  deleteTableTemplate,
  duplicateTableTemplate,
  getTableTemplate,
  listTableTemplates,
  renameTableTemplate,
} from '@/utils/tableTemplates';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';

const state: PersistedState = {
  schemaName: 'public',
  tableName: 'orders',
  tableComment: '订单表',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [
    {
      order: 1,
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: 'ID',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      order: 2,
      fieldName: '',
      fieldType: '',
      fieldComment: '',
      nullable: true,
    },
  ],
  addCount: 10,
  indexInput: 'idx_name',
  currentIndexFields: [{ name: 'id', direction: 'ASC' }],
  indexes: [
    {
      id: 'pk',
      name: 'PRIMARY',
      fields: [{ name: 'id', direction: 'ASC' }],
      unique: true,
      isPrimary: true,
    },
  ],
  authInput: 'app',
  authObjects: ['app'],
  tableMiscConfig: {
    enabled: true,
    engine: 'InnoDB',
  },
};

describe('tableTemplates', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    teardownFakeIndexedDB();
  });

  it('creates a reusable blueprint without table instance fields', () => {
    const blueprint = createBlueprintFromState(state);

    expect(blueprint.dbType).toBe('mysql');
    expect(blueprint.rows).toHaveLength(1);
    expect(blueprint.indexes).toHaveLength(1);
    expect(blueprint.tableMiscConfig?.engine).toBe('InnoDB');
    expect(JSON.stringify(blueprint)).not.toContain('orders');
    expect(JSON.stringify(blueprint)).not.toContain('订单表');
    expect(JSON.stringify(blueprint)).not.toContain('app');
  });

  it('creates, lists, renames, duplicates and deletes templates', async () => {
    const blueprint = createBlueprintFromState(state);
    const first = await createTableTemplate('  ', blueprint, '  demo  ');
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));
    const second = await createTableTemplate('Order Base', blueprint);

    expect(first.name).toBe('未命名蓝本');
    expect(first.description).toBe('demo');
    expect((await listTableTemplates()).map((item) => item.id)).toEqual([second.id, first.id]);

    const renamed = await renameTableTemplate(second.id, '  Order Copy  ');
    expect(renamed?.name).toBe('Order Copy');

    const duplicated = await duplicateTableTemplate(second.id);
    expect(duplicated?.name).toBe('Order Copy (副本)');
    expect(duplicated?.blueprint.rows).toHaveLength(1);

    await deleteTableTemplate(second.id);
    expect(await getTableTemplate(second.id)).toBeUndefined();
  });

  it('applies blueprint while preserving current table identity', () => {
    const blueprint = createBlueprintFromState(state);
    const next = applyBlueprintToState(
      {
        ...state,
        tableName: 'new_orders',
        tableComment: '新订单表',
        rows: [],
        indexes: [],
        authObjects: ['readonly'],
      },
      blueprint,
    );

    expect(next.tableName).toBe('new_orders');
    expect(next.tableComment).toBe('新订单表');
    expect(next.authObjects).toEqual(['readonly']);
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0].order).toBe(1);
    expect(next.indexes).toHaveLength(1);
    expect(next.currentIndexFields).toEqual([]);
    expect(next.indexInput).toBe('');
  });

  it('returns null when duplicating missing template', async () => {
    await expect(duplicateTableTemplate('missing')).resolves.toBeNull();
  });
});
