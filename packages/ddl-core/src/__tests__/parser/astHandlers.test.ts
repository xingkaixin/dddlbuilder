import { describe, expect, it } from 'vitest';
import { Parser } from 'node-sql-parser';
import type { ParsedResult } from '../../parser/types.js';
import {
  parseAlterTable,
  parseCreateIndex,
  parseCreateTable,
  parseDCL,
  parseTransactGrant,
} from '../../parser/astHandlers.js';

const parser = new Parser();
const serializeExpression = (value: unknown) => parser.exprToSQL(value, { database: 'mysql' });

function createResult(): ParsedResult {
  return {
    tableName: '',
    tableComment: '',
    fields: [],
    indexes: [],
    authObjects: [],
  };
}

describe('astHandlers', () => {
  it('parseCreateTable should parse columns, comments and inline indexes', () => {
    const result = createResult();

    parseCreateTable(
      {
        table: [{ table: 'users' }],
        table_options: [{ keyword: 'comment', value: "'用户表'" }],
        create_definitions: [
          {
            resource: 'column',
            column: 'id',
            definition: { dataType: 'INT' },
            primary_key: true,
            auto_increment: true,
            nullable: { value: 'not null' },
            comment: { value: { value: "'主键'" } },
          },
          {
            resource: 'column',
            column: 'uuid_col',
            definition: { dataType: 'CHAR', length: 36 },
            default_val: { value: { keyword: 'UUID' } },
            unique: true,
          },
          {
            resource: 'column',
            column: 'created_at',
            definition: { dataType: 'TIMESTAMP' },
            default_val: { value: { keyword: 'CURRENT_TIMESTAMP' } },
            on_update: { value: { keyword: 'CURRENT_TIMESTAMP' } },
          },
          {
            resource: 'column',
            column: 'custom_func_col',
            definition: { dataType: 'VARCHAR', length: 20 },
            default_val: {
              value: {
                type: 'function',
                name: { name: [{ value: 'my_func' }] },
                args: { type: 'expr_list', value: [] },
              },
            },
            nullable: { value: 'null' },
          },
          {
            resource: 'constraint',
            constraint_type: 'unique',
            definition: [{ column: 'uuid_col' }, { column: 'custom_func_col' }],
          },
          {
            resource: 'index',
            index: 'idx_created',
            index_type: 'unique',
            keyword: 'unique',
            definition: [{ column: 'created_at', order_by: 'desc' }],
          },
        ],
      },
      result,
      serializeExpression,
    );

    expect(result.tableName).toBe('users');
    expect(result.tableComment).toBe('用户表');
    expect(result.fields.find((f) => f.name === 'id')?.defaultKind).toBe('auto_increment');
    expect(result.fields.find((f) => f.name === 'id')?.nullable).toBe(false);
    expect(result.fields.find((f) => f.name === 'id')?.comment).toBe('主键');
    expect(result.fields.find((f) => f.name === 'uuid_col')?.defaultKind).toBe('uuid');
    expect(result.fields.find((f) => f.name === 'created_at')?.defaultKind).toBe(
      'current_timestamp',
    );
    expect(result.fields.find((f) => f.name === 'created_at')?.onUpdate).toBe('current_timestamp');
    expect(result.fields.find((f) => f.name === 'custom_func_col')?.defaultValue).toBe('my_func()');

    const primary = result.indexes.find((i) => i.isPrimary);
    const uniqueInline = result.indexes.find((i) => i.name === 'uk_uuid_col');
    const uniqueConstraint = result.indexes.find((i) => i.name.startsWith('uk_'));
    const uniqueIndex = result.indexes.find((i) => i.name === 'idx_created');

    expect(primary).toBeDefined();
    expect(uniqueInline).toBeDefined();
    expect(uniqueConstraint).toBeDefined();
    expect(uniqueIndex?.fields[0].direction).toBe('DESC');
  });

  it('parseCreateTable should handle named primary/unique constraints', () => {
    const result = createResult();
    parseCreateTable(
      {
        table: [{ table: 'orders' }],
        create_definitions: [
          { resource: 'column', column: 'id', definition: { dataType: 'INT' } },
          {
            resource: 'constraint',
            constraint_type: 'primary key',
            definition: [{ column: 'id' }],
          },
          {
            resource: 'constraint',
            constraint_type: 'unique key',
            constraint: 'uk_orders_code',
            definition: [{ column: 'code' }],
          },
        ],
      },
      result,
      serializeExpression,
    );

    expect(result.indexes.some((i) => i.isPrimary)).toBe(true);
    expect(result.indexes.some((i) => i.name === 'uk_orders_code')).toBe(true);
    expect(result.fields.find((f) => f.name === 'id')?.nullable).toBe(false);
  });

  it('parseCreateIndex should skip invalid/mismatched table and add valid index', () => {
    const result = createResult();
    result.tableName = 'users';

    parseCreateIndex(
      {
        index: 'idx_other',
        table: { table: 'other_table' },
        index_columns: [{ column: 'id' }],
      },
      result,
    );
    expect(result.indexes).toHaveLength(0);

    parseCreateIndex(
      {
        index: 'idx_no_columns',
        table: { table: 'users' },
      },
      result,
    );
    expect(result.indexes).toHaveLength(0);

    parseCreateIndex(
      {
        index: 'idx_users_name',
        table: { table: 'users' },
        columns: [{ column: 'name', order: 'asc' }],
        keyword: 'unique',
      },
      result,
    );
    expect(result.indexes).toHaveLength(1);
    expect(result.indexes[0].name).toBe('idx_users_name');
    expect(result.indexes[0].unique).toBe(true);
  });

  it('parseAlterTable should parse both add primary key shapes', () => {
    const result = createResult();
    result.fields = [
      {
        name: 'id',
        type: 'INT',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    parseAlterTable({ expr: null }, result);
    expect(result.indexes).toHaveLength(0);

    parseAlterTable(
      {
        expr: [
          {
            action: 'add',
            create_definitions: {
              constraint_type: 'primary key',
              definition: [{ column: 'id' }],
            },
          },
        ],
      },
      result,
    );

    parseAlterTable(
      {
        expr: [
          {
            action: 'add',
            resource: 'constraint',
            constraint_type: 'primary key',
            definition: [{ column: 'id' }],
          },
        ],
      },
      result,
    );

    expect(result.indexes.length).toBe(2);
    expect(result.fields[0].nullable).toBe(false);
  });

  it('parseDCL and parseTransactGrant should collect auth users without duplicates', () => {
    const result = createResult();

    parseDCL(
      {
        user_or_roles: [{ name: { value: 'app_user' } }, { user: 'reader' }, 'raw_user'],
      },
      result,
    );
    parseDCL({ to: [{ name: { value: 'app_user' } }] }, result);

    parseTransactGrant({}, result);
    parseTransactGrant(
      [{ stmt: { left: { name: 'TO' }, right: { name: [{ value: 'sa' }] } } }],
      result,
    );
    parseTransactGrant(
      [{ stmt: { left: { name: 'TO' }, right: { name: [{ value: 'sa' }] } } }],
      result,
    );

    expect(result.authObjects).toEqual(['app_user', 'reader', 'raw_user', 'sa']);
  });
});
