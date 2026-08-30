import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildDDL } from '@ddlbuilder/ddl-core';
import {
  applyBlueprintToState,
  createBlueprintFromState,
  createTableTemplate,
  deleteTableTemplate,
  duplicateTableTemplate,
  getTableTemplate,
  listTableTemplates,
  updateTableTemplate,
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
      id: 'field-id',
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: 'ID',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      id: 'field-empty',
      fieldName: '',
      fieldType: '',
      fieldComment: '',
      nullable: true,
    },
  ],
  addCount: 10,
  indexes: [
    {
      id: 'pk',
      name: 'PRIMARY',
      fields: [{ name: 'id', direction: 'ASC' }],
      kind: 'primary',
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
    vi.useFakeTimers({ toFake: ['Date'] });
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

    await updateTableTemplate(second.id, { name: 'Order Copy' });
    const renamed = await getTableTemplate(second.id);
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
    expect(next.rows[0].fieldName).toBe('id');
    expect(next.indexes).toHaveLength(1);
  });

  it.each(['table', 'view'] as const)(
    'rebuilds blueprint structure without inheriting constraints from the current %s',
    (objectType) => {
      const current: PersistedState = {
        ...state,
        objectType,
        viewDefinition: 'SELECT customer_id FROM archived_orders',
        rows: [{ ...state.rows[0], id: 'customer', fieldName: 'customer_id' }],
        foreignKeys: [
          {
            id: 'fk-customer',
            name: 'fk_customer',
            fields: ['customer_id'],
            refTable: 'customers',
            refFields: ['id'],
          },
        ],
        fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
      };
      const next = applyBlueprintToState(current, createBlueprintFromState(state));
      const ddl = buildDDL({
        ...next,
        fields: next.rows.map((row) => ({
          name: row.fieldName,
          type: row.fieldType,
          comment: row.fieldComment,
          nullable: row.nullable,
          defaultKind: row.defaultKind ?? 'none',
          defaultValue: row.defaultValue ?? '',
          onUpdate: row.onUpdate ?? 'none',
        })),
      });
      console.info('Applied blueprint structure', {
        objectType: next.objectType,
        fields: next.rows.map((row) => row.fieldName),
        foreignKeys: next.foreignKeys,
        ddl,
      });

      expect(next.foreignKeys ?? []).toEqual([]);
      expect(ddl).not.toContain('customer_id');
      expect(next.objectType).toBe('table');
      expect(next.viewDefinition ?? '').toBe('');
      expect(next.fieldTableViewConfig).toEqual(current.fieldTableViewConfig);
      expect(next.schemaName).toBe(current.schemaName);
      expect(next.authObjects).toEqual(current.authObjects);
      expect(current.foreignKeys).toHaveLength(1);
    },
  );

  it('returns null when duplicating missing template', async () => {
    await expect(duplicateTableTemplate('missing')).resolves.toBeNull();
  });
});
