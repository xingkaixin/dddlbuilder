import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { SqlParser } from '../../parser/SqlParser.js';
import { SqlParseError } from '../../parser/index.js';
import type { ParsedResult } from '../../parser/types.js';

function createEmptyResult(): ParsedResult {
  return {
    tableName: '',
    tableComment: '',
    fields: [],
    indexes: [],
    foreignKeys: [],
    authObjects: [],
  };
}

const sqlParserRuntimeImportFiles = [
  '../../parser/SqlParser.ts',
  '../../parser/SqlParseError.ts',
  '../../parser/preprocessors/index.ts',
  '../../parser/preprocessors/OraclePreprocessor.ts',
  '../../parser/preprocessors/PostgresPreprocessor.ts',
  '../../parser/preprocessors/SqlServerPreprocessor.ts',
  '../../parser/astHandlers.ts',
  '../../parser/normalizers.ts',
  '../../parser/parserLoader.ts',
  '../../parser/partitionParser.ts',
  '../../parser/preprocessMysql.ts',
  '../../parser/types.ts',
  '../../configs/reservedKeywords.ts',
  '../../utils/databaseFamily.ts',
  '../../utils/sqlIdentifiers.ts',
].map((relativePath) => fileURLToPath(new URL(relativePath, import.meta.url)));

describe('SqlParser internals', () => {
  it('服务端运行子树不应使用目录导入或省略 .js 后缀', () => {
    const invalidImports: string[] = [];

    for (const filePath of sqlParserRuntimeImportFiles) {
      const content = readFileSync(filePath, 'utf8');
      const matches = content.matchAll(
        /(?:import|export)\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"](\.[^'"]+)['"]/g,
      );

      for (const [, specifier] of matches) {
        if (specifier.endsWith('.js')) {
          continue;
        }
        invalidImports.push(`${filePath}: ${specifier}`);
      }
    }

    expect(invalidImports).toEqual([]);
  });

  it('parse 在未初始化时应抛出明确错误', () => {
    const parser = new SqlParser();
    expect(() => parser.parse('CREATE TABLE t(id INT);', 'mysql')).toThrow(
      'SqlParser尚未初始化，请使用 parseAsync() 方法。',
    );
  });

  it('parseAsync 应将 astify 输入错误标记为 SqlParseError', async () => {
    const parser = new SqlParser();

    await expect(
      parser.parseAsync('CREATE TABLE t(id INT, broken);', 'mysql'),
    ).rejects.toMatchObject({
      name: 'SqlParseError',
      message: '无法解析 SQL，请检查语法或数据库类型是否正确。',
      parserMessage: expect.stringMatching(/expected/i),
    });
  });

  it('parseAsync 应保留 astify 内部异常', async () => {
    const internalError = new Error('internal failure');
    const parser = new SqlParser({
      astify: vi.fn(() => {
        throw internalError;
      }),
    } as any);

    await expect(parser.parseAsync('CREATE TABLE t(id INT);', 'mysql')).rejects.toBe(internalError);
  });

  it('parseMultiAsync 只把 SqlParseError 计入 failed', async () => {
    const syntaxResult = await new SqlParser().parseMultiAsync('bad sql', 'mysql');
    expect(syntaxResult.results).toEqual([]);
    expect(syntaxResult.failed).toEqual([
      { statement: 'bad sql', error: expect.stringMatching(/expected/i) },
    ]);

    const internalParser = new SqlParser({
      astify: vi.fn(() => ({
        type: 'create',
        keyword: 'table',
        get table() {
          throw new Error('internal failure');
        },
      })),
    } as any);
    await expect(internalParser.parseMultiAsync('CREATE TABLE t(id INT)', 'mysql')).rejects.toThrow(
      'internal failure',
    );
  });

  it('SqlParseError 可由 parser 包入口识别', () => {
    expect(new SqlParseError('detail')).toBeInstanceOf(Error);
  });

  it('parse 应在 sqlserver 下回填 GRANT 用户', () => {
    const parser = new SqlParser({
      astify: vi.fn().mockReturnValue([]),
    } as any);

    const result = parser.parse('GRANT SELECT ON dbo.Users TO [report_user];', 'sqlserver');

    expect(result.authObjects).toEqual(['report_user']);
  });

  it('mergeComments 应仅在缺失时写入表注释并更新字段注释', () => {
    const parser = new SqlParser();
    const result: ParsedResult = {
      ...createEmptyResult(),
      tableComment: '已有表注释',
      fields: [
        {
          name: 'id',
          type: 'INT',
          comment: '',
          nullable: false,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
        {
          name: 'name',
          type: 'VARCHAR(20)',
          comment: '已有列注释',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ],
    };

    (parser as any).mergeComments(
      result,
      '新表注释',
      {
        id: '主键注释',
      },
      'mysql',
    );

    expect(result.tableComment).toBe('已有表注释');
    expect(result.fields[0].comment).toBe('主键注释');
    expect(result.fields[1].comment).toBe('已有列注释');
  });

  it('parse 应处理 mysql 预处理后的注释合并路径', () => {
    const parser = new SqlParser({
      astify: vi.fn().mockReturnValue([]),
    } as any);

    const sql = `
      CREATE TABLE users (
        id INT COMMENT '主键'
      ) COMMENT='用户表'
      PARTITION BY HASH(id) PARTITIONS 4;
    `;

    const result = parser.parse(sql, 'mysql');
    expect(result.tableComment).toBe('用户表');
  });
});
