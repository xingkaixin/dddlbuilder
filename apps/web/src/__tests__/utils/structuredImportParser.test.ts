import { describe, expect, it } from 'vitest';
import { parseExcelImport, parseStructuredImportText } from '@/utils/structuredImportParser';

describe('structuredImportParser', () => {
  it('parses CSV field rows into a table', () => {
    const [table] = parseStructuredImportText(
      'csv',
      '字段名,字段类型,字段注释\nid,bigint,用户 ID\nname,varchar(100),用户名\nemail,varchar(255),邮箱',
      'users.csv',
    );

    expect(table.tableName).toBe('users');
    expect(table.fields).toEqual([
      expect.objectContaining({ name: 'id', type: 'bigint', comment: '用户 ID', nullable: true }),
      expect.objectContaining({
        name: 'name',
        type: 'varchar(100)',
        comment: '用户名',
        nullable: true,
      }),
      expect.objectContaining({
        name: 'email',
        type: 'varchar(255)',
        comment: '邮箱',
        nullable: true,
      }),
    ]);
  });

  it('parses TSV field rows into a table', () => {
    const [table] = parseStructuredImportText(
      'csv',
      'fieldName\tfieldType\tfieldComment\nid\tbigint\tUser ID',
      'users.tsv',
    );

    expect(table.tableName).toBe('users');
    expect(table.fields[0]).toEqual(
      expect.objectContaining({ name: 'id', type: 'bigint', comment: 'User ID' }),
    );
  });

  it('parses a JSON Schema object into one table', () => {
    const [table] = parseStructuredImportText(
      'json',
      JSON.stringify({
        title: 'User',
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer', format: 'int64', description: 'User ID' },
          createdAt: { type: 'string', format: 'date-time' },
          profile: { type: 'object' },
        },
      }),
      'fallback',
    );

    expect(table.tableName).toBe('User');
    expect(table.fields).toEqual([
      expect.objectContaining({
        name: 'id',
        type: 'bigint',
        nullable: false,
        comment: 'User ID',
      }),
      expect.objectContaining({ name: 'createdAt', type: 'datetime', nullable: true }),
      expect.objectContaining({ name: 'profile', type: 'json', nullable: true }),
    ]);
  });

  it('parses OpenAPI component schemas into table collection', () => {
    const tables = parseStructuredImportText(
      'json',
      JSON.stringify({
        openapi: '3.0.0',
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
              },
            },
            Order: {
              type: 'object',
              properties: {
                amount: { type: 'number' },
              },
            },
          },
        },
      }),
      'fallback',
    );

    expect(tables.map((table) => table.tableName)).toEqual(['User', 'Order']);
    expect(tables[1].fields[0]).toEqual(
      expect.objectContaining({ name: 'amount', type: 'decimal(18,2)' }),
    );
  });

  it('parses Excel sheets into table collection', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ['fieldName', 'fieldType', 'fieldComment'],
      ['id', 'bigint', 'User ID'],
      ['name', 'varchar(100)', 'User name'],
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, 'users');
    const data = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = new File([data], 'tables.xlsx');

    const tables = await parseExcelImport(file);

    expect(tables).toHaveLength(1);
    expect(tables[0].tableName).toBe('users');
    expect(tables[0].fields).toEqual([
      expect.objectContaining({ name: 'id', type: 'bigint', comment: 'User ID' }),
      expect.objectContaining({ name: 'name', type: 'varchar(100)', comment: 'User name' }),
    ]);
  });
});
