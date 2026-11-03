import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { createFieldRow, createPersistedState } from '@/__tests__/utils/testFactories';
import {
  defaultRelationshipIntent,
  planTableRelationship,
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

  return createPersistedState({
    tableName,
    dbType: 'mysql',
    rows: [
      createFieldRow(`${tableName}-${fieldName}`, {
        fieldName,
        fieldType: options.fieldType ?? 'BIGINT',
        nullable: options.nullable ?? false,
      }),
    ],
    indexes:
      options.isPrimary || options.isUnique
        ? [
            {
              id: `${tableName}-key`,
              name: options.isPrimary ? `pk_${tableName}` : `uk_${tableName}_${fieldName}`,
              fields: [{ name: fieldName, direction: 'ASC' }],
              kind: options.isPrimary ? 'primary' : 'unique_index',
            },
          ]
        : [],
  });
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
  it('rejects unsupported actions before creating a relationship', () => {
    const result = planTableRelationship(createDraft(), createIntent({ onDelete: 'SET DEFAULT' }));
    expect(result).toEqual({ ok: false, error: 'unsupported-foreign-key-action' });
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
});

it('preserves physical columns and indexes when documenting a logical relationship', () => {
  const source = createTable('orders', { fieldName: 'user_id', nullable: true });
  const target = createTable('users');
  const intent = defaultRelationshipIntent({ source, target }, 'user_id', 'id');

  const result = planTableRelationship(
    { source, target },
    {
      ...intent,
      logical: true,
      cardinality: 'one-to-one',
      optionality: 'required',
      description: 'Order owner',
      onDelete: 'CASCADE',
    },
  );
  expect(result.ok).toBe(true);

  if (!result.ok) return;
  expect(result.plan.sourceState.rows).toEqual(source.rows);
  expect(result.plan.sourceState.indexes).toEqual(source.indexes);
  expect(result.plan.foreignKey.logical).toEqual({
    cardinality: 'one-to-one',
    optionality: 'required',
    description: 'Order owner',
  });
  expect(result.plan.foreignKey.onDelete).toBeUndefined();
});
