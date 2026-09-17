import type { DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import { getSqlIdentifierKey } from '@ddlbuilder/ddl-core';
import { requestMultiSqlParse } from '@/services/sqlParseService';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import { getImportCharacterLimit } from '@/utils/importLimits';
import i18n from '@/i18n';

export async function parseSqlSnapshot(
  sql: string,
  dbType: DatabaseType,
): Promise<PersistedState[]> {
  if (!sql.trim()) return [];
  const limit = getImportCharacterLimit('sql') ?? 50_000;

  if (sql.length > limit) throw new Error(i18n.t('schemaTools.inputLimit', { limit }));
  const parsed = await requestMultiSqlParse({ sql, dbType, strict: true });

  if (parsed.failed.length) {
    throw new Error(
      parsed.failed.map((failure) => `${failure.error}\n${failure.statement}`).join('\n\n'),
    );
  }

  if (!parsed.results.length) throw new Error(i18n.t('schemaTools.noParsedTables'));
  const names = new Set<string>();

  return parsed.results.map((result) => {
    const table = convertParsedResultToPersistedState(result, dbType);

    const key = JSON.stringify([
      getSqlIdentifierKey(table.schemaName, dbType),
      getSqlIdentifierKey(table.tableName, dbType),
    ]);

    if (names.has(key))
      throw new Error(
        i18n.t('schemaTools.duplicateTable', {
          name: [table.schemaName, table.tableName].filter(Boolean).join('.'),
        }),
      );
    names.add(key);

    return table;
  });
}
