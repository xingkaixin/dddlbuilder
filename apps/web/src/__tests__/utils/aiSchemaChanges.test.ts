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
  describe.each(['postgresql', 'kingbase', 'gaussdb'] as const)('%s identifiers', (dbType) => {
    it.each(['add', 'remove', 'modify', 'rename'] as const)(
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
          { tableName: baseState.tableName, tableComment: baseState.tableComment, fields: rows },
          { baseState },
        );
        const changes = buildAISchemaChanges(baseState, candidate);
        const applied = applyAISchemaChanges(baseState, candidate, changes);
        expect(applied.rows).toEqual(candidate.rows);
        expect(applied.rows[0]).toEqual(upper);
        expect(applyAISchemaChanges(applied, candidate, changes)).toEqual(applied);
      },
    );

    it('keeps case-distinct index identities during additions and removals', () => {
      const baseState = createBaseState();
      baseState.dbType = dbType;
      const upper = { ...baseState.indexes[0], id: 'upper', name: 'Idx_phone' };
      const lower = { ...baseState.indexes[0], id: 'lower', name: 'idx_phone' };
      baseState.indexes = [upper];
      const candidate = buildPersistedStateFromAISchema(
        {
          tableName: baseState.tableName,
          tableComment: baseState.tableComment,
          fields: baseState.rows,
          indexes: [upper, lower],
        },
        { baseState },
      );
      const added = applyAISchemaChanges(
        baseState,
        candidate,
        buildAISchemaChanges(baseState, candidate),
      );
      expect(added.indexes.map((index) => index.name)).toEqual(['Idx_phone', 'idx_phone']);
      expect(new Set(added.indexes.map((index) => index.id)).size).toBe(2);
      const removedCandidate = { ...added, indexes: [added.indexes[0]] };
      const removed = applyAISchemaChanges(
        added,
        removedCandidate,
        buildAISchemaChanges(added, removedCandidate),
      );
      expect(removed.indexes).toEqual([added.indexes[0]]);
    });

    it('uses dialect-aware name fallback for editor metadata', () => {
      const baseState = createBaseState();
      baseState.dbType = dbType;
      baseState.rows = ['UserID', 'userid'].map((fieldName, index) => ({
        ...baseState.rows[1],
        id: fieldName,
        fieldName,
        enumMeta: [{ value: String(index) }],
      }));
      const candidate = buildPersistedStateFromAISchema(
        {
          tableName: baseState.tableName,
          tableComment: baseState.tableComment,
          fields: baseState.rows.map(({ id: _id, enumMeta: _meta, ...row }) => row),
        },
        { baseState },
      );
      expect(candidate.rows).toEqual(baseState.rows);
    });
  });

  it('preserves enum metadata when AI only adds an unrelated field', () => {
    const baseState = createBaseState();
    baseState.rows[1].enumMeta = [
      { value: '1', color: '#00ff00', i18n: { 'zh-CN': '启用', 'en-US': 'Active' } },
    ];
    const schema: GeneratedTableSchema = {
      tableName: baseState.tableName,
      tableComment: baseState.tableComment,
      fields: [
        ...baseState.rows.map(({ enumMeta: _enumMeta, ...row }) => ({
          ...row,
          defaultKind: row.defaultKind ?? 'none',
        })),
        {
          fieldName: 'email',
          fieldType: 'varchar(255)',
          fieldComment: '',
          nullable: true,
          defaultKind: 'none',
        },
      ],
      indexes: baseState.indexes.map((index) => ({ ...index, unique: index.kind !== 'index' })),
    };
    const candidate = buildPersistedStateFromAISchema(schema, { baseState });
    const changes = buildAISchemaChanges(baseState, candidate);
    const applied = applyAISchemaChanges(baseState, candidate, changes);
    expect(changes.map((change) => change.id)).toEqual(['field:add::email']);
    expect(applied.rows[1].enumMeta).toEqual(baseState.rows[1].enumMeta);
  });

  it.each(['modify', 'rename'] as const)(
    'preserves editor-owned metadata during an AI field %s',
    (operation) => {
      const baseState = createBaseState();
      baseState.rows[1].enumMeta = [{ value: '1', color: '#123456', i18n: { 'zh-CN': '启用' } }];
      const schema: GeneratedTableSchema = {
        tableName: baseState.tableName,
        tableComment: baseState.tableComment,
        fields: baseState.rows.map(({ enumMeta: _enumMeta, ...row }) => ({
          ...row,
          fieldName: row.fieldName === 'phone' && operation === 'rename' ? 'mobile' : row.fieldName,
          fieldType:
            row.fieldName === 'phone' && operation === 'modify' ? 'varchar(64)' : row.fieldType,
          defaultKind: row.defaultKind ?? 'none',
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

  it.each([null, 'new-field'])('does not inherit metadata for a new field identity %s', (id) => {
    const baseState = createBaseState();
    baseState.rows[1].enumMeta = [{ value: '1' }];
    const candidate = buildPersistedStateFromAISchema(
      {
        tableName: 'users',
        tableComment: '',
        fields: [{ ...baseState.rows[1], id, defaultKind: 'none' }],
      },
      { baseState },
    );
    expect(candidate.rows[0].enumMeta).toBeUndefined();
  });

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
        ...row,
        fieldName: row.fieldName === 'phone' ? 'mobile' : row.fieldName,
        defaultKind: row.defaultKind ?? 'none',
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

  it('applies explicitly selected index changes after propagating a field rename', () => {
    const baseState = createBaseState();
    const schema: GeneratedTableSchema = {
      tableName: baseState.tableName,
      tableComment: baseState.tableComment,
      fields: baseState.rows.map((row) => ({
        ...row,
        fieldName: row.fieldName === 'phone' ? 'mobile' : row.fieldName,
        defaultKind: row.defaultKind ?? 'none',
      })),
      indexes: [{ ...baseState.indexes[0], fields: [{ name: 'mobile', direction: 'ASC' }] }],
    };
    const candidate = buildPersistedStateFromAISchema(schema, { baseState });
    const changes = buildAISchemaChanges(baseState, candidate);
    const applied = applyAISchemaChanges(baseState, candidate, changes);
    expect(applied.indexes[0]).toMatchObject({
      name: 'uk_users_phone',
      fields: [{ name: 'mobile' }],
    });

    const removedCandidate = { ...candidate, indexes: [] };
    const removed = applyAISchemaChanges(
      baseState,
      removedCandidate,
      buildAISchemaChanges(baseState, removedCandidate),
    );
    expect(removed.indexes).toEqual([]);
  });

  it('applies simultaneous field renames by identity without rewriting a field twice', () => {
    const baseState = createBaseState();
    const schema: GeneratedTableSchema = {
      tableName: baseState.tableName,
      tableComment: baseState.tableComment,
      fields: baseState.rows.map((row) => ({
        ...row,
        fieldName: row.fieldName === 'phone' ? 'id' : 'phone',
        defaultKind: row.defaultKind ?? 'none',
      })),
      indexes: [],
    };
    const candidate = buildPersistedStateFromAISchema(schema, { baseState });
    const changes = buildAISchemaChanges(baseState, candidate).filter(
      (change) => change.kind === 'field',
    );
    const applied = applyAISchemaChanges(baseState, candidate, changes);
    expect(applied.rows.map(({ id, fieldName }) => ({ id, fieldName }))).toEqual([
      { id: 'field-id', fieldName: 'phone' },
      { id: 'field-phone', fieldName: 'id' },
    ]);
    expect(applied.indexes[0].fields[0].name).toBe('id');
  });

  it('retains the kind of existing unique constraints in an AI candidate', () => {
    const baseState = createBaseState();
    baseState.indexes = baseState.indexes.map((index) => ({ ...index, kind: 'unique_constraint' }));
    const schema: GeneratedTableSchema = {
      tableName: baseState.tableName,
      tableComment: baseState.tableComment,
      fields: baseState.rows.map((row) => ({ ...row, defaultKind: row.defaultKind ?? 'none' })),
      indexes: baseState.indexes.map(({ name, fields, kind }) => ({
        name,
        fields,
        unique: kind !== 'index',
      })),
    };
    const candidate = buildPersistedStateFromAISchema(schema, { baseState });
    expect(candidate.indexes).toEqual(baseState.indexes);
  });

  it.each([true, false])('preserves a named composite primary key (returned=%s)', (returned) => {
    const baseState = createBaseState();
    baseState.dbType = 'postgresql';
    const primary = {
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
        fields: baseState.rows.map((row) => ({ ...row, isPrimaryKey: true })),
        indexes: returned ? [primary] : [],
      },
      { baseState },
    );
    expect(candidate.indexes).toEqual([primary]);
    expect(buildAISchemaChanges(baseState, candidate)).toEqual([]);
    expect(generateAlterDDL(diffPersistedState(baseState, candidate))).toBe('');
  });

  it('updates primary-key columns without duplicating the existing identity', () => {
    const baseState = createBaseState();
    baseState.indexes = [
      {
        id: 'primary',
        name: 'users_pkey',
        kind: 'primary',

        fields: [{ name: 'id', direction: 'ASC' }],
      },
    ];
    const candidate = buildPersistedStateFromAISchema(
      {
        tableName: baseState.tableName,
        tableComment: baseState.tableComment,
        fields: baseState.rows.map((row) => ({ ...row, isPrimaryKey: row.fieldName === 'phone' })),
        indexes: baseState.indexes.map((index) => ({ ...index, unique: index.kind !== 'index' })),
      },
      { baseState },
    );
    const applied = applyAISchemaChanges(
      baseState,
      candidate,
      buildAISchemaChanges(baseState, candidate),
    );
    expect(applied.indexes).toEqual([
      { ...baseState.indexes[0], fields: [{ name: 'phone', direction: 'ASC' }] },
    ]);
  });

  it('keeps existing secondary indexes separate when creating a primary key', () => {
    const baseState = createBaseState();
    const candidate = buildPersistedStateFromAISchema(
      {
        tableName: baseState.tableName,
        tableComment: baseState.tableComment,
        fields: baseState.rows.map((row) => ({ ...row, isPrimaryKey: row.fieldName === 'phone' })),
        indexes: baseState.indexes.map((index) => ({ ...index, unique: index.kind !== 'index' })),
      },
      { baseState },
    );
    expect(candidate.indexes).toHaveLength(2);
    expect(candidate.indexes.find((index) => index.id === 'idx-phone')?.kind).toBe('unique_index');
    expect(candidate.indexes.filter((index) => index.kind === 'primary')).toHaveLength(1);
  });

  it('uses the supplied unique index for a new primary key without naming heuristics', () => {
    const baseState = createBaseState();
    baseState.indexes = [];
    const candidate = buildPersistedStateFromAISchema(
      {
        tableName: baseState.tableName,
        tableComment: baseState.tableComment,
        fields: baseState.rows.map((row) => ({ ...row, isPrimaryKey: row.fieldName === 'id' })),
        indexes: [{ name: 'users_pkey', unique: true, fields: [{ name: 'id', direction: 'ASC' }] }],
      },
      { baseState },
    );
    expect(candidate.indexes).toEqual([
      expect.objectContaining({ name: 'users_pkey', kind: 'primary' }),
    ]);
  });

  it('removes a primary key when its field markers and index are removed', () => {
    const baseState = createBaseState();
    baseState.indexes = [
      {
        id: 'primary',
        name: 'users_pkey',
        kind: 'primary',

        fields: [{ name: 'id', direction: 'ASC' }],
      },
    ];
    const candidate = buildPersistedStateFromAISchema(
      {
        tableName: baseState.tableName,
        tableComment: baseState.tableComment,
        fields: baseState.rows.map((row) => ({ ...row, isPrimaryKey: false })),
        indexes: [],
      },
      { baseState },
    );
    expect(
      applyAISchemaChanges(baseState, candidate, buildAISchemaChanges(baseState, candidate))
        .indexes,
    ).toEqual([]);
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
      indexes: baseState.indexes.map((index) => ({ ...index, unique: index.kind !== 'index' })),
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
          kind: 'primary',
          fields: [{ name: 'id', direction: 'ASC' }],
        }),
      ],
    });
  });
});
