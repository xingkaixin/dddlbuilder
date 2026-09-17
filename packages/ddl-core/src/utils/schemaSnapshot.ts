import type { NormalizedField, PersistedState } from '@ddlbuilder/shared-types';
import { getSqlIdentifierKey } from './sqlIdentifiers.js';

export function snapshotTableKey(
  table: PersistedState,
  name = table.tableName,
  schema = table.schemaName,
): string {
  return JSON.stringify([
    getSqlIdentifierKey(schema, table.dbType),
    getSqlIdentifierKey(name, table.dbType),
  ]);
}

export function snapshotTableLabel(table: PersistedState): string {
  return [table.schemaName, table.tableName].filter(Boolean).join('.');
}

export function snapshotFields(table: PersistedState): NormalizedField[] {
  return table.rows.flatMap((row) =>
    row.fieldName.trim()
      ? [
          {
            name: row.fieldName.trim(),
            type: row.fieldType,
            comment: row.fieldComment,
            nullable: row.nullable,
            defaultKind: row.defaultKind ?? 'none',
            defaultValue: row.defaultValue ?? '',
            onUpdate: row.onUpdate ?? 'none',
            enumMeta: row.enumMeta,
          },
        ]
      : [],
  );
}

export function indexSnapshot(tables: PersistedState[]): Map<string, PersistedState> {
  const indexed = new Map<string, PersistedState>();

  for (const table of tables) {
    const key = snapshotTableKey(table);

    if (!table.tableName.trim() || indexed.has(key))
      throw new Error(`Invalid or duplicate table: ${snapshotTableLabel(table)}`);
    indexed.set(key, table);
  }

  return indexed;
}
