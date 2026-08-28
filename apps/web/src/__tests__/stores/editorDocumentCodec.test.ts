import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { toEditorDocumentState, toPersistedState } from '@/stores/editorDocumentCodec';
import { useEditorStore } from '@/stores/editorStore';
import { act, renderHook } from '@testing-library/react';
import { useClearAllActions } from '@/components/App/hooks/useClearAllActions';

const createState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  objectType: 'table',
  schemaName: 'public',
  tableName: 'accounts',
  tableComment: 'Account records',
  dbType: 'postgresql-citus',
  sqlFormatMode: 'aligned',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [
    {
      id: 'field-id',
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: 'Primary key',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  addCount: 10,
  indexInput: 'idx_accounts_id',
  currentIndexFields: [{ name: 'id', direction: 'ASC' }],
  indexes: [
    {
      id: 'index-id',
      name: 'idx_accounts_id',
      fields: [{ name: 'id', direction: 'ASC' }],
      kind: 'unique_index',
    },
  ],
  authInput: 'reader',
  authObjects: ['reader'],
  citusShardingConfig: {
    mode: 'distributed',
    distributionColumn: 'id',
  },
  mysqlPartitionConfig: undefined,
  tableMiscConfig: {
    enabled: true,
    fillfactor: 80,
  },
  fieldTableViewConfig: {
    freezeEnabled: true,
    freezeColumns: 4,
  },
  foreignKeys: [
    {
      id: 'foreign-key-id',
      name: 'fk_accounts_tenant',
      fields: ['id'],
      refTable: 'tenants',
      refFields: ['id'],
    },
  ],
  ...overrides,
});

describe('editorDocumentCodec', () => {
  it('清空操作一次性重置完整文档并为新字段分配身份', () => {
    useEditorStore.getState().replaceDocument(createState());
    const { result, unmount } = renderHook(() =>
      useClearAllActions({
        setIsClearDialogOpen: () => {},
        clearState: () => {},
        resetDocument: useEditorStore.getState().resetDocument,
      }),
    );
    act(() => result.current.confirmClearAll());

    const current = toPersistedState(useEditorStore.getState());
    const initial = toPersistedState(useEditorStore.getInitialState());
    const { rows, ...document } = current;
    const { rows: initialRows, ...initialDocument } = initial;
    expect(document).toEqual(initialDocument);
    expect(rows.map(({ id: _id, ...field }) => field)).toEqual(
      initialRows.map(({ id: _id, ...field }) => field),
    );
    const previousIds = new Set(['field-id', ...initialRows.map((row) => row.id)]);
    expect(rows.every((row) => !previousIds.has(row.id))).toBe(true);
    unmount();
  });

  it('完整保留规范化后的编辑器文档', () => {
    const state = createState();

    expect(toPersistedState(toEditorDocumentState(state))).toEqual(state);
  });

  it('只持久化当前数据库支持的配置', () => {
    const state = createState({
      dbType: 'mysql',
      citusShardingConfig: undefined,
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: ['id'],
        partitionCount: 8,
      },
    });

    const persistedState = toPersistedState(toEditorDocumentState(state));

    expect(persistedState.citusShardingConfig).toBeUndefined();
    expect(persistedState.mysqlPartitionConfig).toEqual(state.mysqlPartitionConfig);
  });
});
