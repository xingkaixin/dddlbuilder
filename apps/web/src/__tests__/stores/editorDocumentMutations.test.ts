import { describe, expect, it } from 'vitest';
import {
  withDefaultEditorSession,
  type DatabaseType,
  type PersistedState,
} from '@ddlbuilder/shared-types';
import { buildDDL } from '@ddlbuilder/ddl-core';
import { useEditorStore } from '@/stores/editorStore';
import { buildNormalizedFields } from '@/stores/fieldStore';

const parentForeignKey = {
  id: 'self',
  name: 'fk_parent',
  fields: ['parent_id'],
  refTable: 'users',
  refFields: ['id'],
};

function createState(overrides: Partial<PersistedState> = {}): PersistedState {
  return withDefaultEditorSession({
    dbType: 'mysql',
    schemaName: '',
    tableName: 'users',
    tableComment: '',
    authInput: '',
    authObjects: [],
    rows: [
      { id: 'id', fieldName: 'id', fieldType: 'int', fieldComment: '', nullable: false },
      { id: 'parent', fieldName: 'parent_id', fieldType: 'int', fieldComment: '', nullable: true },
    ],
    indexes: [
      {
        id: 'pk',
        name: 'pk_users',
        fields: [{ name: 'id', direction: 'ASC' }],
        kind: 'primary',
      },
    ],
    foreignKeys: [{ ...parentForeignKey }],
    ...overrides,
  });
}

function createCaseSensitiveState(dbType: DatabaseType): PersistedState {
  return createState({
    dbType,
    rows: [
      { id: 'upper', fieldName: 'UserID', fieldType: 'int', fieldComment: '', nullable: false },
      { id: 'lower', fieldName: 'userid', fieldType: 'int', fieldComment: '', nullable: false },
    ],
    indexes: [
      {
        id: 'upper-index',
        name: 'idx_UserID',
        fields: [{ name: 'UserID', direction: 'ASC' }],
        kind: 'unique_index',
      },
      {
        id: 'lower-index',
        name: 'idx_userid',
        fields: [{ name: 'userid', direction: 'ASC' }],
        kind: 'unique_index',
      },
    ],
    foreignKeys: [{ ...parentForeignKey, fields: ['userid'], refFields: ['UserID'] }],
  });
}

describe('editor document references', () => {
  it('renames and removes real partition references without touching SQL literals', () => {
    const state = createState({
      rows: [
        {
          id: 'date',
          fieldName: 'created_at',
          fieldType: 'date',
          fieldComment: '',
          nullable: false,
        },
      ],
      indexes: [],
      foreignKeys: [],
      mysqlPartitionConfig: {
        enabled: true,
        type: 'RANGE',
        columns: [],
        expression: "YEAR(created_at) + LENGTH('created_at') /* created_at */",
        partitions: [],
      },
    });
    useEditorStore.getState().replaceDocument(state);
    useEditorStore
      .getState()
      .setRows((rows) => rows.map((row) => ({ ...row, fieldName: 'created on' })));
    expect(useEditorStore.getState().mysqlPartitionConfig?.expression).toBe(
      "YEAR(`created on`) + LENGTH('created_at') /* created_at */",
    );
    useEditorStore.getState().handleRemoveRow(0, 1);
    expect(useEditorStore.getState().mysqlPartitionConfig).toMatchObject({
      enabled: false,
      expression: undefined,
    });
  });

  it('updates self references when the table and schema change', () => {
    useEditorStore.getState().replaceDocument(
      createState({
        foreignKeys: [
          { ...parentForeignKey },
          { ...parentForeignKey, id: 'external', refSchema: 'other' },
        ],
      }),
    );
    useEditorStore.getState().setTableName('accounts');
    useEditorStore.getState().setSchemaName('audit');
    const state = useEditorStore.getState();
    expect(state.foreignKeys[0]).toMatchObject({ refTable: 'accounts', refSchema: 'audit' });
    expect(state.foreignKeys[1]).toMatchObject({ refTable: 'users', refSchema: 'other' });
  });

  it.each(['postgresql'] as const)('%s renames only references to the exact field', (dbType) => {
    useEditorStore.getState().replaceDocument(createCaseSensitiveState(dbType));
    useEditorStore
      .getState()
      .setRows((rows) =>
        rows.map((row) => (row.id === 'upper' ? { ...row, fieldName: 'account_id' } : row)),
      );
    const state = useEditorStore.getState();
    expect(
      state.indexes.map((index) => ({ name: index.name, field: index.fields[0].name })),
    ).toEqual([
      { name: 'idx_account_id', field: 'account_id' },
      { name: 'idx_userid', field: 'userid' },
    ]);
    expect(state.foreignKeys[0]).toMatchObject({ fields: ['userid'], refFields: ['account_id'] });
  });

  it('renames a self-referenced primary key in one store update', () => {
    useEditorStore.getState().replaceDocument(createState());
    useEditorStore
      .getState()
      .setRows((rows) =>
        rows.map((row) => (row.id === 'id' ? { ...row, fieldName: 'user_id' } : row)),
      );
    const state = useEditorStore.getState();

    const ddl = buildDDL({
      dbType: state.dbType,
      tableName: state.tableName,
      tableComment: '',
      fields: buildNormalizedFields(state.rows),
      indexes: state.indexes,
      foreignKeys: state.foreignKeys,
    });
    expect(state.foreignKeys[0].refFields).toEqual(['user_id']);
    expect(ddl).toContain('REFERENCES users (user_id)');
    expect(ddl).not.toContain('REFERENCES users (id)');
  });

  it('removes a self-reference when its referenced field is deleted but keeps external references', () => {
    const state = createState({
      foreignKeys: [
        { ...parentForeignKey },
        { ...parentForeignKey, id: 'external', name: 'fk_account', refTable: 'accounts' },
      ],
    });
    useEditorStore.getState().replaceDocument(state);
    useEditorStore.getState().handleRemoveRow(0, 1);
    expect(useEditorStore.getState().foreignKeys.map((fk) => fk.id)).toEqual(['external']);
  });
});
