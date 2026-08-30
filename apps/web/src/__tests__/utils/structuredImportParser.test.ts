import { describe, expect, it } from 'vitest';
import { parseExcelImport, parseStructuredImportText } from '@/utils/structuredImportParser';
import { EXCEL_WORKBOOK_LIMITS, STRUCTURED_IMPORT_LIMITS } from '@/utils/importLimits';

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

  it('rejects CSV input with more than 1,000 fields', () => {
    const content = [
      'fieldName,fieldType',
      ...Array.from(
        { length: STRUCTURED_IMPORT_LIMITS.maxFieldsPerTable + 1 },
        (_, index) => `field_${index},bigint`,
      ),
    ].join('\n');

    expect(() => parseStructuredImportText('csv', content, 'oversized.csv')).toThrow(
      '结构化导入超过规模限制',
    );
  });

  it('rejects JSON Schema input with more than 50 tables', () => {
    const schemas = Object.fromEntries(
      Array.from({ length: STRUCTURED_IMPORT_LIMITS.maxTables + 1 }, (_, index) => [
        `Table_${index}`,
        { type: 'object', properties: {} },
      ]),
    );

    expect(() =>
      parseStructuredImportText('json', JSON.stringify({ $defs: schemas }), 'schema.json'),
    ).toThrow('结构化导入超过规模限制');
  });

  it('rejects JSON Schema input with more than 5,000 total fields', () => {
    const schemas = Object.fromEntries(
      Array.from({ length: 6 }, (_, tableIndex) => {
        const fieldCount = tableIndex === 5 ? 1 : STRUCTURED_IMPORT_LIMITS.maxFieldsPerTable;
        const properties = Object.fromEntries(
          Array.from({ length: fieldCount }, (_, fieldIndex) => [
            `field_${fieldIndex}`,
            { type: 'integer' },
          ]),
        );
        return [`Table_${tableIndex}`, { type: 'object', properties }];
      }),
    );

    expect(() =>
      parseStructuredImportText('json', JSON.stringify({ $defs: schemas }), 'schema.json'),
    ).toThrow('结构化导入超过规模限制');
  });

  it('rejects self-referencing JSON Schemas with a stable error', () => {
    const schema = { $defs: { Recursive: { $ref: '#/$defs/Recursive' } } };

    expect(() => parseStructuredImportText('json', JSON.stringify(schema), 'schema.json')).toThrow(
      'JSON Schema 存在循环引用或嵌套过深，无法安全导入',
    );
  });

  it('keeps bounded JSON Schema references working', () => {
    const tables = parseStructuredImportText(
      'json',
      JSON.stringify({
        $defs: {
          Id: { type: 'integer', format: 'int64' },
          User: {
            type: 'object',
            properties: { id: { $ref: '#/$defs/Id' } },
          },
        },
      }),
      'schema.json',
    );

    expect(tables.find((table) => table.tableName === 'User')?.fields[0]).toEqual(
      expect.objectContaining({ name: 'id', type: 'bigint' }),
    );
  });

  it('rejects excessively nested JSON Schema compositions', () => {
    let property: Record<string, unknown> = { type: 'integer' };
    for (let depth = 0; depth <= 32; depth += 1) property = { allOf: [property] };

    expect(() =>
      parseStructuredImportText(
        'json',
        JSON.stringify({ title: 'Nested', type: 'object', properties: { id: property } }),
        'schema.json',
      ),
    ).toThrow('JSON Schema 存在循环引用或嵌套过深，无法安全导入');
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

  it('keeps legacy XLS imports compatible', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([
        ['fieldName', 'fieldType'],
        ['id', 'bigint'],
      ]),
      'legacy',
    );
    const data = xlsx.write(workbook, { type: 'array', bookType: 'xls' });

    const [table] = await parseExcelImport(new File([data], 'legacy.xls'));

    expect(table.fields).toEqual([expect.objectContaining({ name: 'id', type: 'bigint' })]);
  });

  it('rejects an Excel sheet with more than 1,000 fields', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([['fieldName', 'fieldType', 'fieldComment']]);
    sheet.A250001 = { t: 's', v: 'overflow' };
    sheet['!ref'] = 'A1:C250001';
    xlsx.utils.book_append_sheet(workbook, sheet, 'oversized');
    const data = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });

    await expect(parseExcelImport(new File([data], 'oversized.xlsx'))).rejects.toThrow(
      'Excel 工作簿超过导入规模限制',
    );
  });

  it('applies the same field limit to legacy XLS workbooks', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ['fieldName', 'fieldType'],
      ...Array.from({ length: EXCEL_WORKBOOK_LIMITS.maxFieldsPerSheet + 1 }, (_, index) => [
        `field_${index}`,
        'bigint',
      ]),
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, 'legacy');
    const data = xlsx.write(workbook, { type: 'array', bookType: 'xls' });

    await expect(parseExcelImport(new File([data], 'legacy.xls'))).rejects.toThrow(
      'Excel 工作簿超过导入规模限制',
    );
  });

  it('accepts exactly 1,000 Excel fields', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ['fieldName', 'fieldType', 'fieldComment'],
      ...Array.from({ length: EXCEL_WORKBOOK_LIMITS.maxFieldsPerSheet }, (_, index) => [
        `field_${index}`,
        'bigint',
        '',
      ]),
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, 'boundary');
    const data = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });

    const tables = await parseExcelImport(new File([data], 'boundary.xlsx'));

    expect(tables[0].fields).toHaveLength(EXCEL_WORKBOOK_LIMITS.maxFieldsPerSheet);
  });

  it('rejects Excel workbooks with more than 50 sheets', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    for (let index = 0; index <= EXCEL_WORKBOOK_LIMITS.maxSheets; index += 1) {
      xlsx.utils.book_append_sheet(
        workbook,
        xlsx.utils.aoa_to_sheet([['fieldName'], [`field_${index}`]]),
        `sheet_${index}`,
      );
    }
    const data = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });

    await expect(parseExcelImport(new File([data], 'many-sheets.xlsx'))).rejects.toThrow(
      'Excel 工作簿超过导入规模限制',
    );
  });

  it('rejects Excel sheets that extend beyond column P', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([['fieldName']]);
    sheet.Q2 = { t: 's', v: 'overflow' };
    sheet['!ref'] = 'A1:Q2';
    xlsx.utils.book_append_sheet(workbook, sheet, 'wide');
    const data = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });

    await expect(parseExcelImport(new File([data], 'wide.xlsx'))).rejects.toThrow(
      'Excel 工作簿超过导入规模限制',
    );
  });

  it('rejects Excel workbooks with more than 5,000 total fields', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    for (let index = 0; index < 6; index += 1) {
      const sheet = xlsx.utils.aoa_to_sheet([['fieldName', 'fieldType', 'fieldComment']]);
      const lastRow = index === 5 ? 2 : 1001;
      sheet[`A${lastRow}`] = { t: 's', v: `field_${index}` };
      sheet['!ref'] = `A1:C${lastRow}`;
      xlsx.utils.book_append_sheet(workbook, sheet, `sheet_${index}`);
    }
    const data = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });

    await expect(parseExcelImport(new File([data], 'many-fields.xlsx'))).rejects.toThrow(
      'Excel 工作簿超过导入规模限制',
    );
  });

  it('applies the 200,000 character limit to Excel cell content', async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ['fieldName', 'fieldType', 'fieldComment'],
      ...Array.from({ length: 7 }, (_, index) => [
        `field_${index}`,
        'varchar(255)',
        'x'.repeat(30_000),
      ]),
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, 'large-content');
    const data = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });

    await expect(parseExcelImport(new File([data], 'large-content.xlsx'))).rejects.toThrow(
      '导入内容过长，最大允许 200,000 个字符',
    );
  });
});
