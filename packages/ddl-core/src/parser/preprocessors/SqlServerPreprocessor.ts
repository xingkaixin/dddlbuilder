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
  sql = sql
    .replace(/EXEC\s+sys\.sp_executesql\s+N'((?:[^']|'')*)'\s*;/gi, (_match, batch: string) =>
      batch.replaceAll("''", "'"),
    )
    .replace(
      /DECLARE\s+@ddlbuilderSchema\s+sysname\s*=\s*OBJECT_SCHEMA_NAME\(OBJECT_ID\(N'(?:[^']|'')*'\)\);/gi,
      '',
    );
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

  const execRegex =
    /EXEC\s+(?:sys\.)?sp_(?:add|update|drop)extendedproperty\b(?:[^';]|'(?:[^']|'')*')*;/gi;
  let sqlWithoutExec = sql;
  let match: RegExpExecArray | null = execRegex.exec(sql);

  while (match !== null) {
    const block = match[0];
    sqlWithoutExec = sqlWithoutExec.replace(block, '');

    const paramMap: Record<string, string> = {};
    const paramRegex = /@(\w+)\s*=\s*N?'((?:[^']|'')*)'/gi;
    let p: RegExpExecArray | null = paramRegex.exec(block);
    while (p !== null) {
      paramMap[p[1].toLowerCase()] = p[2].replaceAll("''", "'");
      p = paramRegex.exec(block);
    }

    if ((paramMap['name'] || '').toLowerCase() !== 'ms_description') {
      match = execRegex.exec(sql);
      continue;
    }

    const comment = paramMap['value'] || '';
    const level1Type = (paramMap['level1type'] || '').toLowerCase();
    const level1Name = paramMap['level1name'] || '';
    const schemaName =
      (paramMap['level0type'] || '').toLowerCase() === 'schema' ? paramMap['level0name'] : '';
    const tableName = schemaName
      ? `[${schemaName.replaceAll(']', ']]')}].[${level1Name.replaceAll(']', ']]')}]`
      : level1Name;
    const level2Type = (paramMap['level2type'] || '').toLowerCase();
    const level2Name = paramMap['level2name'] || '';

    if (level1Type === 'table' && level1Name && !level2Type) {
      getTableMetadata(tableName).tableComment = comment;
    } else if (level1Type === 'table' && level1Name && level2Type === 'column' && level2Name) {
      getTableMetadata(tableName).columnComments[level2Name] = comment;
    }

    match = execRegex.exec(sql);
  }

  const normalizedSql = sqlWithoutExec.replace(/gen_random_uuid\(\)/gi, 'uuid()');

  return { sql: normalizedSql, tableMetadata: Array.from(metadataByTable.values()) };
}
