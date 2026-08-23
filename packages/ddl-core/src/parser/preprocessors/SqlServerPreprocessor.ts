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
  const metadataByTable = new Map<string, PreprocessResult['tableMetadata'][number]>();
  const getTableMetadata = (tableName: string) => {
    const existing = metadataByTable.get(tableName);
    if (existing) return existing;
    const metadata: PreprocessResult['tableMetadata'][number] = {
      tableName,
      tableComment: '',
      columnComments: {},
    };
    metadataByTable.set(tableName, metadata);
    return metadata;
  };

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
    const level1Name = paramMap['level1name'] || '';
    const level2Type = (paramMap['level2type'] || '').toLowerCase();
    const level2Name = paramMap['level2name'] || '';

    if (level1Type === 'table' && level1Name && !level2Type) {
      getTableMetadata(level1Name).tableComment = comment;
    } else if (level1Type === 'table' && level1Name && level2Type === 'column' && level2Name) {
      getTableMetadata(level1Name).columnComments[level2Name] = comment;
    }

    match = execRegex.exec(sql);
  }

  const normalizedSql = sqlWithoutExec.replace(/gen_random_uuid\(\)/gi, 'uuid()');

  return { sql: normalizedSql, tableMetadata: Array.from(metadataByTable.values()) };
}
