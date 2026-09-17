import type { PersistedState } from '@ddlbuilder/shared-types';
import { snapshotTableKey, indexSnapshot } from './schemaSnapshot.js';
import { getSqlIdentifierKey } from './sqlIdentifiers.js';

export function refreshSchemaSnapshot(before: PersistedState[], incoming: PersistedState[]) {
  const previous = indexSnapshot(before);
  indexSnapshot(incoming);
  const database = before[0]?.dbType ?? incoming[0]?.dbType;

  if (
    !database ||
    !['mysql', 'postgresql'].includes(database) ||
    [...before, ...incoming].some((table) => table.dbType !== database)
  )
    throw new Error('Refresh requires one database dialect: MySQL or PostgreSQL.');
  const warnings: string[] = [];

  const tables = incoming.map((next) => {
    const old = previous.get(snapshotTableKey(next));

    if (!old) return { ...next };

    const fields = new Map(
      old.rows.flatMap((row) =>
        row.fieldName.trim()
          ? [[getSqlIdentifierKey(row.fieldName, old.dbType), row] as const]
          : [],
      ),
    );

    return {
      ...next,
      tableComment: old.tableComment || next.tableComment,
      rows: next.rows.map((row) => {
        const existing = fields.get(getSqlIdentifierKey(row.fieldName, next.dbType));

        return existing
          ? {
              ...row,
              id: existing.id,
              fieldComment: existing.fieldComment || row.fieldComment,
              ...(existing.enumMeta ? { enumMeta: existing.enumMeta } : {}),
              ...(existing.standardId ? { standardId: existing.standardId } : {}),
            }
          : { ...row };
      }),
      foreignKeys: [
        ...(next.foreignKeys ?? []).filter((relation) => !relation.logical),
        ...(old.foreignKeys ?? []).filter((relation) => relation.logical),
      ],
    };
  });
  const selected = indexSnapshot(tables);

  for (const table of tables) {
    const key = (name: string) => getSqlIdentifierKey(name, table.dbType);
    table.foreignKeys = (table.foreignKeys ?? []).filter((relation) => {
      if (!relation.logical) return true;

      const target = selected.get(
        snapshotTableKey(table, relation.refTable, relation.refSchema || table.schemaName),
      );
      const valid =
        target &&
        relation.fields.every((name) =>
          table.rows.some((row) => key(row.fieldName) === key(name)),
        ) &&
        relation.refFields.every((name) =>
          target.rows.some((row) => key(row.fieldName) === key(name)),
        );

      if (!valid)
        warnings.push(
          `${table.tableName}.${relation.name}: logical relationship omitted because its table or field is missing.`,
        );

      return Boolean(valid);
    });
  }

  return {
    tables,
    warnings,
    added: tables.flatMap((table) =>
      previous.has(snapshotTableKey(table)) ? [] : [table.tableName],
    ),
    removed: before.flatMap((table) =>
      selected.has(snapshotTableKey(table)) ? [] : [table.tableName],
    ),
  };
}
