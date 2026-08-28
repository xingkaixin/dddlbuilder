import { describe, expect, it } from 'vitest';
import { decodePersistedState } from '@ddlbuilder/workspace-core';
import { buildDDL, getForeignKeyIssue } from '@ddlbuilder/ddl-core';

describe('imported foreign key field correspondence', () => {
  it('preserves invalid field positions and omits only the invalid foreign key', () => {
    const state = decodePersistedState({
      tableName: 'orders',
      dbType: 'postgresql',
      rows: [],
      indexes: [],
      foreignKeys: [
        {
          id: 'fk',
          name: 'fk_owner',
          fields: ['tenant_id', null, 'user_id'],
          refTable: 'users',
          refFields: ['id', 'tenant_id', null],
        },
      ],
    });
    expect(state?.foreignKeys).toHaveLength(1);
    if (!state?.foreignKeys) throw new Error('Expected imported foreign key');
    expect(state.foreignKeys[0].fields).toEqual(['tenant_id', '', 'user_id']);
    expect(state.foreignKeys[0].refFields).toEqual(['id', 'tenant_id', '']);
    expect(getForeignKeyIssue(state.foreignKeys[0], state.dbType)?.kind).toBe('fields');
    const sql = buildDDL({
      dbType: state.dbType,
      tableName: state.tableName,
      tableComment: state.tableComment,
      foreignKeys: state.foreignKeys,
      fields: ['tenant_id', 'user_id'].map((name) => ({
        name,
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      })),
    });
    expect(sql).toContain('Manual migration required');
    expect(sql).toContain('CREATE TABLE orders');
    expect(sql).not.toContain('FOREIGN KEY');
  });
});
