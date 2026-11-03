import { describe, expect, it } from 'vitest';
import type { FieldRow, IndexDefinition, PersistedState } from '@ddlbuilder/shared-types';
import type {
  GeneratedField,
  GeneratedIndex,
  GeneratedTableSchema,
} from '@ddlbuilder/shared-types/ai-generate';
import { diffPersistedState, generateAlterDDL } from '@ddlbuilder/ddl-core';
import { buildAISchemaChanges, buildPersistedStateFromAISchema } from '@/utils/aiSchemaChanges';
import { applyAISchemaChanges } from '@/components/App/aiSchemaPatchTransition';

function toGeneratedField(row: FieldRow): GeneratedField {
  return {
    id: row.id,
    fieldName: row.fieldName,
    fieldType: row.fieldType,
    fieldComment: row.fieldComment,
    nullable: row.nullable,
    defaultKind: row.defaultKind ?? 'none',
    defaultValue: row.defaultValue,
    onUpdate: row.onUpdate,
  };
}

function toGeneratedIndex(index: IndexDefinition): GeneratedIndex {
  return {
    name: index.name,
    fields: index.fields,
    unique: index.kind !== 'index',
  };
}

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
    indexes: [
      {
        id: 'idx-phone',
        name: 'uk_users_phone',
        fields: [{ name: 'phone', direction: 'ASC' }],
        kind: 'unique_index',
      },
    ],
    authInput: '',
    authObjects: [],
    foreignKeys: [],
  };
}

describe('aiSchemaChanges', () => {
  describe.each(['postgresql'] as const)('%s identifiers', (dbType) => {
    it.each<'add' | 'remove' | 'modify' | 'rename'>(['remove', 'rename'])(
      'applies a field %s without confusing case-distinct names',
      (operation) => {
        const baseState = createBaseState();
        baseState.dbType = dbType;
        baseState.indexes = [];
        const upper = { ...baseState.rows[1], id: 'upper', fieldName: 'UserID' };
        const lower = { ...baseState.rows[1], id: 'lower', fieldName: 'userid' };
        baseState.rows = operation === 'add' ? [upper] : [upper, lower];

        const rows =
          operation === 'remove'
            ? [upper]
            : [
                upper,
                {
                  ...lower,
                  fieldName: operation === 'rename' ? 'account_id' : lower.fieldName,
                  fieldType: operation === 'modify' ? 'varchar(64)' : lower.fieldType,
                },
              ];
        const candidate = buildPersistedStateFromAISchema(
          {
            tableName: baseState.tableName,
            tableComment: baseState.tableComment,
            fields: rows.map(toGeneratedField),
          },
          { baseState },
        );
        const changes = buildAISchemaChanges(baseState, candidate);
        const applied = applyAISchemaChanges(baseState, candidate, changes);
        expect(applied.rows).toEqual(candidate.rows);
        expect(applied.rows[0]).toEqual(upper);
        expect(applyAISchemaChanges(applied, candidate, changes)).toEqual(applied);
      },
    );
  });

  it.each<'modify' | 'rename'>(['rename'])(
    'preserves editor-owned metadata during an AI field %s',
    (operation) => {
      const baseState = createBaseState();
      baseState.rows[1].enumMeta = [{ value: '1', color: '#123456', i18n: { 'zh-CN': '启用' } }];

      const schema: GeneratedTableSchema = {
        tableName: baseState.tableName,
        tableComment: baseState.tableComment,
        fields: baseState.rows.map((row) => ({
          ...toGeneratedField(row),
          fieldName: row.fieldName === 'phone' && operation === 'rename' ? 'mobile' : row.fieldName,
          fieldType:
            row.fieldName === 'phone' && operation === 'modify' ? 'varchar(64)' : row.fieldType,
        })),
        indexes: [],
      };
      const candidate = buildPersistedStateFromAISchema(schema, { baseState });

      const changes = buildAISchemaChanges(baseState, candidate).filter(
        (change) => change.kind === 'field',
      );
      expect(changes.map((change) => change.type)).toEqual([operation]);
      const applied = applyAISchemaChanges(baseState, candidate, changes);
      expect(applied.rows[1].enumMeta).toEqual(baseState.rows[1].enumMeta);
    },
  );

  it('keeps a renamed field identity and updates its dependencies when only the rename is applied', () => {
    const baseState = createBaseState();
    baseState.foreignKeys = [
      {
        id: 'fk-phone',
        name: 'fk_phone',
        fields: ['phone'],
        refTable: 'contacts',
        refFields: ['phone'],
      },
    ];

    const schema: GeneratedTableSchema = {
      tableName: baseState.tableName,
      tableComment: baseState.tableComment,
      fields: baseState.rows.map((row) => ({
        ...toGeneratedField(row),
        fieldName: row.fieldName === 'phone' ? 'mobile' : row.fieldName,
      })),
      indexes: [],
    };
    const candidate = buildPersistedStateFromAISchema(schema, { baseState });

    const changes = buildAISchemaChanges(baseState, candidate).filter(
      (change) => change.kind === 'field',
    );
    expect(changes.map((change) => change.type)).toEqual(['rename']);
    const applied = applyAISchemaChanges(baseState, candidate, changes);
    expect(applied.rows[1].id).toBe('field-phone');
    expect(applied.indexes[0].fields[0].name).toBe('mobile');
    expect(applied.foreignKeys?.[0].fields).toEqual(['mobile']);
    const ddl = generateAlterDDL(diffPersistedState(baseState, applied));
    expect(ddl).toContain('RENAME COLUMN phone TO mobile');
    expect(ddl).not.toContain('DROP COLUMN');
    expect(ddl).not.toContain('ADD COLUMN');
  });

  it.each([true, false])('preserves a named composite primary key (returned=%s)', (returned) => {
    const baseState = createBaseState();
    baseState.dbType = 'postgresql';

    const primary: IndexDefinition = {
      id: 'primary',
      name: 'users_pkey',
      kind: 'primary',

      fields: [
        { name: 'phone', direction: 'DESC' as const },
        { name: 'id', direction: 'ASC' as const },
      ],
    };
    baseState.indexes = [primary];

    const candidate = buildPersistedStateFromAISchema(
      {
        tableName: baseState.tableName,
        tableComment: baseState.tableComment,
        fields: baseState.rows.map((row) => ({ ...toGeneratedField(row), isPrimaryKey: true })),
        indexes: returned ? [toGeneratedIndex(primary)] : [],
      },
      { baseState },
    );
    expect(candidate.indexes).toEqual([primary]);
    expect(buildAISchemaChanges(baseState, candidate)).toEqual([]);
    expect(generateAlterDDL(diffPersistedState(baseState, candidate))).toBe('');
  });

  it('preserves existing field identities when applying an incremental addition', () => {
    const baseState = createBaseState();

    const schema: GeneratedTableSchema = {
      tableName: baseState.tableName,
      tableComment: baseState.tableComment,
      fields: [
        ...baseState.rows.map(toGeneratedField),
        {
          fieldName: 'email',
          fieldType: 'varchar(255)',
          fieldComment: '',
          nullable: true,
          defaultKind: 'none',
        },
      ],
      indexes: baseState.indexes.map(toGeneratedIndex),
    };
    const candidate = buildPersistedStateFromAISchema(schema, { baseState });
    const changes = buildAISchemaChanges(baseState, candidate);
    const applied = applyAISchemaChanges(baseState, candidate, changes);

    expect(changes.map((change) => change.id)).toEqual(['field:add::email']);
    expect(applied.rows.slice(0, 2)).toEqual(baseState.rows);
    expect(applied.rows[2].id).toBeTruthy();
    expect(new Set(applied.rows.map((row) => row.id)).size).toBe(3);
    expect(generateAlterDDL(diffPersistedState(baseState, applied))).toBe(
      'ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL;',
    );
  });
});
