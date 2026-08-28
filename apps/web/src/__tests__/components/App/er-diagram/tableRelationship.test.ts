import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { getForeignKeyIssue } from '@ddlbuilder/ddl-core';
import {
  defaultRelationshipIntent,
  planTableRelationship,
  referencedKeyFields,
  type TableRelationshipIntent,
} from '@/components/App/er-diagram/tableRelationship';

function createTable(
  tableName: string,
  options: {
    fieldName?: string;
    fieldType?: string;
    nullable?: boolean;
    isPrimary?: boolean;
    isUnique?: boolean;
  } = {},
): PersistedState {
  const fieldName = options.fieldName ?? 'id';
  return {
    schemaName: '',
    tableName,
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [
      {
        order: 1,
        fieldName,
        fieldType: options.fieldType ?? 'BIGINT',
        fieldComment: '',
        nullable: options.nullable ?? false,
      },
    ],
    addCount: 1,
    indexInput: '',
    currentIndexFields: [],
    indexes:
      options.isPrimary || options.isUnique
        ? [
            {
              id: `${tableName}-key`,
              name: options.isPrimary ? `pk_${tableName}` : `uk_${tableName}_${fieldName}`,
              fields: [{ name: fieldName, direction: 'ASC' }],
              unique: options.isPrimary || options.isUnique || false,
              isPrimary: options.isPrimary,
            },
          ]
        : [],
    authInput: '',
    authObjects: [],
  };
}

function createIntent(overrides: Partial<TableRelationshipIntent> = {}): TableRelationshipIntent {
  return {
    name: 'fk_orders_user_id_to_users',
    sourceField: 'user_id',
    targetField: 'id',
    cardinality: 'many-to-one',
    optionality: 'optional',
    createIndex: true,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
    ...overrides,
  };
}

function createDraft() {
  return {
    source: createTable('orders', {
      fieldName: 'user_id',
      nullable: false,
    }),
    target: createTable('users', { isPrimary: true }),
  };
}

describe('tableRelationship', () => {
  it('creates an Oracle relationship without unsupported default actions', () => {
    const draft = createDraft();
    draft.source.dbType = 'oracle';
    draft.target.dbType = 'oracle';
    const intent = defaultRelationshipIntent(draft, 'user_id', 'id');
    const result = planTableRelationship(draft, intent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getForeignKeyIssue(result.plan.foreignKey, 'oracle')).toBeNull();
  });

  it('rejects unsupported actions before creating a relationship', () => {
    const result = planTableRelationship(createDraft(), createIntent({ onDelete: 'SET DEFAULT' }));
    expect(result).toEqual({ ok: false, error: 'unsupported-foreign-key-action' });
  });

  it('only exposes single-field primary and unique keys as reference targets', () => {
    const state = createTable('users', { isUnique: true });
    state.indexes?.push({
      id: 'composite',
      name: 'uk_users_id_tenant',
      fields: [
        { name: 'id', direction: 'ASC' },
        { name: 'tenant_id', direction: 'ASC' },
      ],
      kind: 'unique_index',
    });

    expect([...referencedKeyFields(state)]).toEqual(['id']);
  });

  it('uses safe referential actions and derives optionality for a new relationship', () => {
    const draft = createDraft();

    const intent = defaultRelationshipIntent(draft, 'user_id', 'id');
    expect(intent).toMatchObject({
      cardinality: 'many-to-one',
      optionality: 'optional',
      createIndex: true,
    });
    expect(intent.onDelete).toBeUndefined();
    expect(intent.onUpdate).toBeUndefined();
  });

  it('plans a many-to-one relationship with nullability and an index', () => {
    const result = planTableRelationship(createDraft(), createIntent());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.foreignKey).toMatchObject({
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });
    expect(result.plan.sourceState.rows[0]?.nullable).toBe(true);
    expect(result.plan.addedIndex).toMatchObject({
      name: 'idx_orders_user_id',
      kind: 'index',
    });
    expect(result.plan.sourceState.indexes).toHaveLength(1);
  });

  it('plans one-to-one as a unique index without storing redundant cardinality', () => {
    const result = planTableRelationship(
      createDraft(),
      createIntent({ cardinality: 'one-to-one' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.addedIndex).toMatchObject({
      name: 'uk_orders_user_id',
      kind: 'unique_index',
    });
    expect(result.plan.foreignKey).not.toHaveProperty('cardinality');
  });

  it('reuses an existing suitable index', () => {
    const draft = createDraft();
    draft.source.indexes = [
      {
        id: 'existing',
        name: 'idx_orders_user_id',
        fields: [{ name: 'user_id', direction: 'ASC' }],
        kind: 'index',
      },
    ];

    const result = planTableRelationship(draft, createIntent());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.addedIndex).toBeUndefined();
    expect(result.plan.sourceState.indexes).toHaveLength(1);
  });

  it('does not treat a composite unique index as one-to-one uniqueness', () => {
    const draft = createDraft();
    draft.source.indexes = [
      {
        id: 'existing',
        name: 'uk_orders_user_tenant',
        fields: [
          { name: 'user_id', direction: 'ASC' },
          { name: 'tenant_id', direction: 'ASC' },
        ],
        kind: 'unique_index',
      },
      {
        id: 'name-conflict',
        name: 'uk_orders_user_id',
        fields: [{ name: 'other_user_id', direction: 'ASC' }],
        kind: 'unique_index',
      },
    ];

    const result = planTableRelationship(draft, createIntent({ cardinality: 'one-to-one' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.addedIndex?.name).toBe('uk_orders_user_id_2');
  });

  it('requires a constraint name at the relationship module interface', () => {
    expect(planTableRelationship(createDraft(), createIntent({ name: '   ' }))).toEqual({
      ok: false,
      error: 'missing-name',
    });
  });

  it('rejects a reference to a field that is not a primary or unique key', () => {
    const draft = createDraft();
    draft.target.indexes = [];

    expect(planTableRelationship(draft, createIntent())).toEqual({
      ok: false,
      error: 'target-field-not-key',
    });
  });

  it('rejects duplicate relationships and duplicate constraint names', () => {
    const duplicateRelationshipDraft = createDraft();
    duplicateRelationshipDraft.source.foreignKeys = [
      {
        id: 'existing',
        name: 'fk_existing',
        fields: ['user_id'],
        refTable: 'users',
        refFields: ['id'],
      },
    ];

    expect(planTableRelationship(duplicateRelationshipDraft, createIntent())).toEqual({
      ok: false,
      error: 'duplicate-relationship',
    });

    const duplicateNameDraft = createDraft();
    duplicateNameDraft.source.foreignKeys = [
      {
        id: 'existing',
        name: 'fk_orders_user_id_to_users',
        fields: ['account_id'],
        refTable: 'users',
        refFields: ['id'],
      },
    ];
    expect(planTableRelationship(duplicateNameDraft, createIntent())).toEqual({
      ok: false,
      error: 'duplicate-name',
    });
  });

  it('rejects SET NULL when the relationship is required', () => {
    expect(
      planTableRelationship(
        createDraft(),
        createIntent({ optionality: 'required', onDelete: 'SET NULL' }),
      ),
    ).toEqual({
      ok: false,
      error: 'set-null-requires-optional',
    });
  });

  it('warns about field type mismatch without hiding the requested relationship', () => {
    const draft = createDraft();
    const targetField = draft.target.rows[0];
    expect(targetField).toBeDefined();
    if (!targetField) return;
    draft.target.rows[0] = { ...targetField, fieldType: 'VARCHAR(36)' };

    const result = planTableRelationship(draft, createIntent());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.warnings).toEqual(['field-type-mismatch']);
  });

  it('supports a self-referencing relationship when the target field is a key', () => {
    const employee = createTable('employees', { fieldName: 'id', isPrimary: true });
    employee.rows.push({
      order: 2,
      fieldName: 'manager_id',
      fieldType: 'BIGINT',
      fieldComment: '',
      nullable: true,
    });

    const result = planTableRelationship(
      { source: employee, target: employee },
      createIntent({
        name: 'fk_employees_manager',
        sourceField: 'manager_id',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.foreignKey.refTable).toBe('employees');
  });
});
