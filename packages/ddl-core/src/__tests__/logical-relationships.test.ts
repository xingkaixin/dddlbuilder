import { expect, it } from 'vitest';
import type {
  ForeignKeyDefinition,
  NormalizedField,
  PersistedState,
} from '@ddlbuilder/shared-types';
import {
  buildDDL,
  buildORM,
  diffPersistedState,
  generateAlterDDL,
  generateRollbackDDL,
} from '../index';

const foreignKey: ForeignKeyDefinition = {
  id: 'relation',
  name: 'order_owner',
  fields: ['user_id'],
  refTable: 'users',
  refFields: ['id'],
  logical: { cardinality: 'many-to-one', optionality: 'required', description: 'Owner' },
};
const field: NormalizedField = {
  name: 'user_id',
  type: 'bigint',
  comment: '',
  nullable: true,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
};
const before: PersistedState = {
  sqlFormatMode: 'compact',
  schemaName: '',
  tableName: 'orders',
  tableComment: '',
  dbType: 'mysql',
  rows: [
    { id: 'user', fieldName: 'user_id', fieldType: 'bigint', fieldComment: '', nullable: true },
  ],
  indexes: [],
  authInput: '',
  authObjects: [],
  addCount: 1,
};

it('excludes logical relationships from physical DDL and every ORM output', () => {
  const input = {
    dbType: 'mysql' as const,
    tableName: 'orders',
    tableComment: '',
    fields: [field],
  };
  expect(buildDDL({ ...input, foreignKeys: [foreignKey] })).toBe(buildDDL(input));
  for (const target of ['prisma', 'typeorm', 'sqlalchemy', 'gorm', 'jpa'] as const) {
    expect(buildORM(target, { ...input, foreignKeys: [foreignKey] })).toBe(buildORM(target, input));
  }
});

it('only generates physical migration steps when a relationship changes kind', () => {
  const logical = { ...before, foreignKeys: [foreignKey] };
  const diff = diffPersistedState(before, logical);
  expect(diff.foreignKeys).toEqual([]);
  expect(generateAlterDDL(diff)).not.toContain('FOREIGN KEY');
  expect(generateRollbackDDL(diff)).not.toContain('FOREIGN KEY');
  const physical = { ...before, foreignKeys: [{ ...foreignKey, logical: undefined }] };
  expect(diffPersistedState(logical, physical).foreignKeys.map((change) => change.type)).toEqual([
    'add',
  ]);
  expect(diffPersistedState(physical, logical).foreignKeys.map((change) => change.type)).toEqual([
    'remove',
  ]);
});
