import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sqlParserRuntimeImportFiles = [
  '../../parser/SqlParser.ts',
  '../../parser/SqlParseError.ts',
  '../../parser/preprocessors/types.ts',
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
});
