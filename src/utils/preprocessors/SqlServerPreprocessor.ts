import type { PreprocessResult } from './types.js';

/**
 * Preprocess SQL Server SQL for parsing
 *
 * Handles:
 * - Extract and remove sp_addextendedproperty EXEC statements
 * - Parse MS_Description extended properties for table/column comments
 * - Normalize gen_random_uuid() → uuid()
 */
export function preprocessSqlServer(sql: string): PreprocessResult {
  const columnComments: Record<string, string> = {};
  let tableComment = '';

  const execRegex = /EXEC\s+sp_addextendedproperty\s+([\s\S]*?);/gi;
  let sqlWithoutExec = sql;
  let match: RegExpExecArray | null = execRegex.exec(sql);

  while (match !== null) {
    const block = match[0];
    sqlWithoutExec = sqlWithoutExec.replace(block, '');

    const paramMap: Record<string, string> = {};
    const paramRegex = /@(\w+)\s*=\s*N?'([^']*)'/gi;
    let p: RegExpExecArray | null = paramRegex.exec(block);
    while (p !== null) {
      paramMap[p[1].toLowerCase()] = p[2];
      p = paramRegex.exec(block);
    }

    if ((paramMap['name'] || '').toLowerCase() !== 'ms_description') {
      match = execRegex.exec(sql);
      continue;
    }

    const comment = paramMap['value'] || '';
    const level1Type = (paramMap['level1type'] || '').toLowerCase();
    const level2Type = (paramMap['level2type'] || '').toLowerCase();
    const level2Name = paramMap['level2name'] || '';

    if (level1Type === 'table' && !level2Type) {
      tableComment = comment;
    } else if (
      level1Type === 'table' &&
      level2Type === 'column' &&
      level2Name
    ) {
      columnComments[level2Name] = comment;
    }

    match = execRegex.exec(sql);
  }

  const normalizedSql = sqlWithoutExec.replace(
    /gen_random_uuid\(\)/gi,
    'uuid()',
  );

  return { sql: normalizedSql, tableComment, columnComments };
}

/**
 * Extract users from SQL Server GRANT statements
 *
 * Handles various formats:
 * - GRANT SELECT ON table TO user;
 * - GRANT SELECT ON table TO [user];
 * - GRANT SELECT ON table TO N'user';
 */
export function extractSqlServerGrantUsers(sql: string): string[] {
  const users: string[] = [];
  const grantRegex = /GRANT\s+[\s\S]*?\s+TO\s+([^;]+);/gi;
  let match: RegExpExecArray | null = grantRegex.exec(sql);

  while (match !== null) {
    const target = match[1];
    target
      .split(',')
      .map((raw) => raw.trim().replace(/^N'/, "'"))
      .map((value) => {
        let cleaned = value;
        if (
          cleaned.startsWith('[') ||
          cleaned.startsWith("'") ||
          cleaned.startsWith('"')
        ) {
          cleaned = cleaned.slice(1);
        }
        if (
          cleaned.endsWith(']') ||
          cleaned.endsWith("'") ||
          cleaned.endsWith('"')
        ) {
          cleaned = cleaned.slice(0, -1);
        }
        return cleaned;
      })
      .forEach((u) => {
        if (u && !users.includes(u)) users.push(u);
      });

    match = grantRegex.exec(sql);
  }

  return users;
}
