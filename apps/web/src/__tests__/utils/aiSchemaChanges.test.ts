import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';
import { diffPersistedState, generateAlterDDL } from '@ddlbuilder/ddl-core';
import { buildAISchemaChanges, buildPersistedStateFromAISchema } from '@/utils/aiSchemaChanges';
import { applyAISchemaChanges } from '@/components/App/aiSchemaPatchTransition';

function createBaseState(): PersistedState {
  return {
    objectType: 'table',
    schemaName: '',
    tableName: 'users',
    tableComment: '用户',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [
      {
        id: 'field-id',
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
        id: 'field-phone',
        order: 2,
        fieldName: 'phone',
        fieldType: 'varchar(32)',
        fieldComment: '手机号',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ],
    addCount: 10,
    indexInput: '',
    currentIndexFields: [],
    indexes: [
      {
        id: 'idx-phone',
        name: 'uk_users_phone',
        fields: [{ name: 'phone', direction: 'ASC' }],
        unique: true,
      },
    ],
    authInput: '',
    authObjects: [],
    foreignKeys: [],
  };
}

describe('aiSchemaChanges', () => {
  it('retains the kind of existing unique constraints in an AI candidate', () => {
    const baseState = createBaseState();
    baseState.indexes = baseState.indexes.map((index) => ({ ...index, isUniqueConstraint: true }));
    const schema: GeneratedTableSchema = {
      tableName: baseState.tableName,
      tableComment: baseState.tableComment,
      fields: baseState.rows.map((row) => ({ ...row, defaultKind: row.defaultKind ?? 'none' })),
      indexes: baseState.indexes.map(({ name, fields, unique }) => ({ name, fields, unique })),
    };
    const candidate = buildPersistedStateFromAISchema(schema, { baseState });
    expect(candidate.indexes).toEqual(
      baseState.indexes.map((index) => ({ ...index, isPrimary: false })),
    );
  });

  it('builds reviewable changes from an AI candidate schema', () => {
    const baseState = createBaseState();
    const schema: GeneratedTableSchema = {
      tableName: 'user_accounts',
      tableComment: '用户账户',
      fields: [
        {
          fieldName: 'id',
          fieldType: 'bigint',
          fieldComment: 'ID',
          nullable: false,
          defaultKind: 'auto_increment',
          onUpdate: 'none',
          isPrimaryKey: true,
        },
        {
          fieldName: 'phone',
          fieldType: 'varchar(64)',
          fieldComment: '手机号',
          nullable: false,
          defaultKind: 'none',
          onUpdate: 'none',
        },
        {
          fieldName: 'deleted_at',
          fieldType: 'datetime',
          fieldComment: '软删除时间',
          nullable: true,
          defaultKind: 'none',
          onUpdate: 'none',
        },
      ],
      indexes: [
        {
          name: 'uk_users_phone',
          fields: [
            { name: 'phone', direction: 'ASC' },
            { name: 'deleted_at', direction: 'ASC' },
          ],
          unique: true,
        },
      ],
    };

    const candidateState = buildPersistedStateFromAISchema(schema, { baseState });
    const changes = buildAISchemaChanges(baseState, candidateState);

    expect(changes.map((change) => change.id)).toEqual([
      'table:table_name',
      'table:table_comment',
      'field:modify:phone:phone',
      'field:add::deleted_at',
      'index:modify:uk_users_phone',
      'index:add:PRIMARY',
    ]);
    expect(candidateState.indexes.find((index) => index.name === 'uk_users_phone')?.id).toBe(
      'idx-phone',
    );
  });

  it('preserves existing field identities when applying an incremental addition', () => {
    const baseState = createBaseState();
    const schema: GeneratedTableSchema = {
      tableName: baseState.tableName,
      tableComment: baseState.tableComment,
      fields: [
        ...baseState.rows,
        {
          fieldName: 'email',
          fieldType: 'varchar(255)',
          fieldComment: '',
          nullable: true,
          defaultKind: 'none',
        },
      ],
      indexes: baseState.indexes,
    };
    const candidate = buildPersistedStateFromAISchema(schema, { baseState });
    const changes = buildAISchemaChanges(baseState, candidate);
    const applied = applyAISchemaChanges(baseState, candidate, changes);

    expect(changes.map((change) => change.id)).toEqual(['field:add::email']);
    expect(applied.rows.slice(0, 2)).toEqual(baseState.rows);
    expect(applied.rows[2].id).toBeTruthy();
    expect(new Set(applied.rows.map((row) => row.id)).size).toBe(3);
    expect(generateAlterDDL('users', diffPersistedState(baseState, applied), [], 'mysql')).toBe(
      'ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL;',
    );
  });

  it('builds a complete fresh state with the same identity and primary-index rules', () => {
    const state = buildPersistedStateFromAISchema(
      {
        tableName: 'audit.events',
        tableComment: 'Audit events',
        fields: [
          {
            fieldName: 'id',
            fieldType: 'bigint',
            fieldComment: '',
            nullable: false,
            defaultKind: 'none',
            isPrimaryKey: true,
          },
        ],
        indexes: [],
      },
      { dbType: 'postgresql', sqlFormatMode: 'expanded' },
    );

    expect(state).toMatchObject({
      schemaName: 'audit',
      tableName: 'events',
      dbType: 'postgresql',
      sqlFormatMode: 'expanded',
      rows: [expect.objectContaining({ fieldName: 'id' })],
      indexes: [
        expect.objectContaining({
          name: 'PRIMARY',
          isPrimary: true,
          fields: [{ name: 'id', direction: 'ASC' }],
        }),
      ],
    });
  });
});
