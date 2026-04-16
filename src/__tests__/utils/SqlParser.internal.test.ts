import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { SqlParser } from '@/utils/SqlParser';
import type { ParsedResult } from '@/utils/sql-parser/types';

const reporterMocks = vi.hoisted(() => ({
  reportError: vi.fn(),
}));

vi.mock('@/utils/errorReporter', () => ({
  reportError: reporterMocks.reportError,
}));

function createEmptyResult(): ParsedResult {
  return {
    tableName: '',
    tableComment: '',
    fields: [],
    indexes: [],
    authObjects: [],
  };
}

const sqlParserRuntimeImportFiles = [
  '../../utils/SqlParser.ts',
  '../../utils/preprocessors/index.ts',
  '../../utils/preprocessors/OraclePreprocessor.ts',
  '../../utils/preprocessors/PostgresPreprocessor.ts',
  '../../utils/preprocessors/SqlServerPreprocessor.ts',
  '../../utils/primaryKeyNaming.ts',
  '../../utils/databaseTypeMapping.ts',
  '../../utils/TypeMapper.ts',
  '../../utils/sql-parser/astHandlers.ts',
  '../../utils/sql-parser/normalizers.ts',
  '../../utils/sql-parser/parserLoader.ts',
  '../../utils/sql-parser/partitionParser.ts',
  '../../utils/sql-parser/preprocessMysql.ts',
  '../../utils/sql-parser/types.ts',
  '../../configs/typeMappings.ts',
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

  it('parse 应在 astify 异常时返回统一错误信息', () => {
    const astify = vi.fn().mockImplementation(() => {
      throw new Error('broken ast');
    });
    const parser = new SqlParser({ astify } as any);

    expect(() => parser.parse('CREATE TABLE t(id INT);', 'mysql')).toThrow(
      '无法解析 SQL，请检查语法或数据库类型是否正确。',
    );
    expect(astify).toHaveBeenCalledTimes(1);
    expect(reporterMocks.reportError).toHaveBeenCalledTimes(1);
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

    (parser as any).mergeComments(result, '新表注释', {
      id: '主键注释',
    });

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
