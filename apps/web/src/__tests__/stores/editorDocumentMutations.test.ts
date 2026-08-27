import { describe, expect, it } from 'vitest';
import { withDefaultEditorSession, type PersistedState } from '@ddlbuilder/shared-types';
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
        unique: true,
        isPrimary: true,
      },
    ],
    foreignKeys: [{ ...parentForeignKey }],
    ...overrides,
  });
}

describe('editor document references', () => {
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

  it.each([
    { schemaName: 'audit', refSchema: 'audit', refTable: 'users', self: true },
    { schemaName: 'audit', refSchema: undefined, refTable: 'audit.users', self: true },
    { schemaName: 'audit', refSchema: 'other', refTable: 'users', self: false },
    { schemaName: 'audit', refSchema: undefined, refTable: 'users', self: false },
    { schemaName: '', refSchema: undefined, refTable: 'accounts', self: false },
    { schemaName: '', refSchema: undefined, refTable: '"users"', self: true },
    { schemaName: '', refSchema: undefined, refTable: '"Users"', self: false },
  ])(
    'respects the reference identity $refSchema/$refTable',
    ({ schemaName, refSchema, refTable, self }) => {
      const state = createState({
        dbType: 'postgresql',
        schemaName,
        foreignKeys: [{ ...parentForeignKey, refSchema, refTable }],
      });
      useEditorStore.getState().replaceDocument(state);
      useEditorStore
        .getState()
        .setRows((rows) =>
          rows.map((row) => (row.id === 'id' ? { ...row, fieldName: 'user_id' } : row)),
        );
      expect(useEditorStore.getState().foreignKeys[0].refFields).toEqual([self ? 'user_id' : 'id']);
    },
  );

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
