import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SqlParser } from '@ddlbuilder/ddl-core/parser';
import { hasTableChanges } from '@ddlbuilder/ddl-core';
import { useEditorStore } from '@/stores';
import { useDerivedTableState } from '@/components/App/hooks/useDerivedTableState';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';

afterEach(() => {
  cleanup();
  useEditorStore.getState().resetDocument();
});

const loadTable = async () => {
  const parsed = await new SqlParser().parseAsync(
    'CREATE TABLE users (id INT, email VARCHAR(100)); CREATE INDEX email_lookup ON users(email);',
    'mysql',
  );
  useEditorStore.getState().replaceDocument(convertParsedResultToPersistedState(parsed, 'mysql'));
  const signature = buildSchemaStateSignature(toPersistedState(useEditorStore.getState()));
  const loadedTableState = toPersistedState(useEditorStore.getState());
  return renderHook(() =>
    useDerivedTableState({
      ...useEditorStore(),
      loadedTableNormalizedName: 'users',
      loadedTableSignature: signature,
      loadedTableState,
    }),
  );
};

it('加载已有索引时派生计算不修改文档', async () => {
  const { result } = await loadTable();
  expect(result.current.currentPersistedState.indexes[0].name).toBe('email_lookup');
  expect(result.current.isLoadedDirty).toBe(false);
  expect(result.current.tableDiff).toBeNull();
});

it('使用结构化的已保存状态计算变更，不解析内容哈希', async () => {
  const { result } = await loadTable();
  act(() => useEditorStore.getState().setSchemaName('archive'));
  expect(result.current.isLoadedDirty).toBe(true);
  expect(result.current.tableDiff && hasTableChanges(result.current.tableDiff)).toBe(true);
});

it('增删索引、修改表名和数据库不改写已有索引名', async () => {
  await loadTable();
  const store = useEditorStore.getState();
  act(() => {
    store.setIndexes((indexes) => [
      ...indexes,
      {
        id: 'users-id-index',
        name: 'idx_users_id',
        fields: [{ name: 'id', direction: 'ASC' }],
        kind: 'index',
      },
    ]);
  });
  expect(useEditorStore.getState().indexes.map((index) => index.name)).toEqual([
    'email_lookup',
    'idx_users_id',
  ]);
  act(() => {
    store.setTableName('archived_users');
    store.setDbType('postgresql');
  });
  expect(useEditorStore.getState().indexes.map((index) => index.name)).toEqual([
    'email_lookup',
    'idx_users_id',
  ]);
  const added = useEditorStore.getState().indexes[1];
  act(() => store.removeIndex(added.id));
  expect(useEditorStore.getState().indexes.map((index) => index.name)).toEqual(['email_lookup']);
});

it('未命名索引在读入文档时获得默认名', async () => {
  const parsed = await new SqlParser().parseAsync(
    'CREATE TABLE users (id INT, KEY (id));',
    'mysql',
  );
  const imported = convertParsedResultToPersistedState(parsed, 'mysql');
  expect(imported.indexes[0].name).toBe('idx_users_id');
  useEditorStore.getState().replaceDocument({
    ...imported,
    indexes: [{ ...imported.indexes[0], name: '', kind: 'primary' }],
  });
  expect(useEditorStore.getState().indexes[0].name).toBe('pk_users');
});
