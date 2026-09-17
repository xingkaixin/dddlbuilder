import type { PersistedState } from '@ddlbuilder/shared-types';
import { diffPersistedState, hasTableChanges, type TableDiff } from './tableDiff.js';
import { buildDDL } from './ddlGenerators.js';
import { buildQualifiedTableName } from './databaseTypeMapping.js';
import { generateAlterDDL } from './alter-ddl/generateAlterDDL.js';
import { generateAddForeignKey, generateDropForeignKey } from './alter-ddl/foreignKeyStatements.js';
import { getSqlIdentifierKey } from './sqlIdentifiers.js';
import {
  indexSnapshot,
  snapshotFields,
  snapshotTableKey,
  snapshotTableLabel,
} from './schemaSnapshot.js';

export interface SnapshotFieldRename {
  tableKey: string;
  from: string;
  to: string;
}

export interface SchemaTableComparison {
  key: string;
  name: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  before?: PersistedState;
  after?: PersistedState;
  diff?: TableDiff;
}

export interface SchemaComparison {
  tables: SchemaTableComparison[];
  sql: string;
  blockers: string[];
}

function compareTable(
  before: PersistedState,
  after: PersistedState,
  renames: SnapshotFieldRename[],
): TableDiff {
  const key = (name: string) => getSqlIdentifierKey(name, after.dbType);
  const mapping = new Map<string, string>();
  const sources = new Set<string>();

  for (const rename of renames) {
    if (
      mapping.has(key(rename.to)) ||
      sources.has(key(rename.from)) ||
      !before.rows.some((row) => key(row.fieldName) === key(rename.from)) ||
      !after.rows.some((row) => key(row.fieldName) === key(rename.to)) ||
      before.rows.some((row) => key(row.fieldName) === key(rename.to)) ||
      after.rows.some((row) => key(row.fieldName) === key(rename.from))
    )
      throw new Error(`Invalid rename: ${rename.from} → ${rename.to}`);
    mapping.set(key(rename.to), key(rename.from));
    sources.add(key(rename.from));
  }

  return diffPersistedState(
    { ...before, rows: before.rows.map((row) => ({ ...row, id: key(row.fieldName) })) },
    {
      ...after,
      rows: after.rows.map((row) => ({
        ...row,
        id: mapping.get(key(row.fieldName)) ?? key(row.fieldName),
      })),
    },
  );
}

export function compareSchemaSnapshots(
  before: PersistedState[],
  after: PersistedState[],
  renames: SnapshotFieldRename[] = [],
): SchemaComparison {
  const all = [...before, ...after];
  const dbType = all[0]?.dbType;

  if (
    dbType &&
    ((dbType !== 'mysql' && dbType !== 'postgresql') ||
      all.some((table) => table.dbType !== dbType))
  )
    throw new Error('Select one database dialect: MySQL or PostgreSQL.');
  const previous = indexSnapshot(before);
  const next = indexSnapshot(after);
  const tables: SchemaTableComparison[] = [];
  const blockers: string[] = [];

  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    const oldTable = previous.get(key);
    const newTable = next.get(key);
    const table = newTable ?? oldTable;

    if (!table) continue;

    const diff =
      oldTable && newTable
        ? compareTable(
            oldTable,
            newTable,
            renames.filter((rename) => rename.tableKey === key),
          )
        : undefined;
    tables.push({
      key,
      name: snapshotTableLabel(table),
      before: oldTable,
      after: newTable,
      diff,
      status: !oldTable
        ? 'added'
        : !newTable
          ? 'removed'
          : diff && hasTableChanges(diff)
            ? 'modified'
            : 'unchanged',
    });

    if (table.objectType === 'view')
      blockers.push(`${snapshotTableLabel(table)}: views require a separate migration.`);
  }

  const affected = new Set(
    tables.flatMap((table) => (table.status !== 'unchanged' ? [table.key] : [])),
  );
  const drops: string[] = [];
  const changes: string[] = [];
  const additions: string[] = [];

  const qualified = (table: PersistedState) =>
    buildQualifiedTableName(table.schemaName, table.tableName, table.dbType);

  for (const table of before) {
    for (const foreignKey of table.foreignKeys ?? []) {
      if (foreignKey.logical) continue;

      const targetKey = snapshotTableKey(
        table,
        foreignKey.refTable,
        foreignKey.refSchema || table.schemaName,
      );

      if (affected.has(snapshotTableKey(table)) || affected.has(targetKey))
        drops.push(
          generateDropForeignKey(qualified(table), { type: 'remove', foreignKey }, table.dbType),
        );
    }
  }

  for (const table of tables) {
    if (table.status === 'removed' && table.before) {
      changes.push(`DROP TABLE ${qualified(table.before)};`);
    } else if (table.status === 'added' && table.after) {
      changes.push(
        buildDDL({
          ...table.after,
          tableName: qualified(table.after),
          fields: snapshotFields(table.after),
          foreignKeys: [],
        }),
      );
    } else if (table.status === 'modified' && table.diff) {
      const sql = generateAlterDDL({ ...table.diff, foreignKeys: [], unchangedForeignKeys: [] });

      const ownPlan = sql
        .split('\n')
        .filter(
          (line) =>
            !line.startsWith('-- Manual migration required for foreign keys from other tables'),
        )
        .join('\n');
      blockers.push(
        ...ownPlan
          .split('\n')
          .filter((line) => line.startsWith('-- Manual migration required:'))
          .map((line) => `${table.name}: ${line.slice(3)}`),
      );
      changes.push(ownPlan);
    }
  }

  for (const table of after) {
    for (const foreignKey of table.foreignKeys ?? []) {
      if (foreignKey.logical) continue;

      const targetKey = snapshotTableKey(
        table,
        foreignKey.refTable,
        foreignKey.refSchema || table.schemaName,
      );

      if (!affected.has(snapshotTableKey(table)) && !affected.has(targetKey)) continue;
      const target = next.get(targetKey);

      if (previous.has(targetKey) && !target)
        blockers.push(`${snapshotTableLabel(table)}.${foreignKey.name}: target table was removed.`);

      if (
        target &&
        foreignKey.refFields.some(
          (name) =>
            !target.rows.some(
              (row) =>
                getSqlIdentifierKey(row.fieldName, table.dbType) ===
                getSqlIdentifierKey(name, table.dbType),
            ),
        )
      )
        blockers.push(
          `${snapshotTableLabel(table)}.${foreignKey.name}: referenced column is missing.`,
        );

      const relation = {
        ...foreignKey,
        refSchema: foreignKey.refSchema || table.schemaName || undefined,
      };
      additions.push(
        generateAddForeignKey(
          qualified(table),
          { type: 'add', foreignKey: relation },
          table.dbType,
        ),
      );
    }
  }

  const statements = [...drops, ...changes, ...additions].filter((sql) => sql.trim());

  return {
    tables,
    blockers,
    sql:
      blockers.length || !statements.length
        ? ''
        : [
            '-- Review before execution. This plan covers only the supplied schema snapshots.',
            '-- DROP operations permanently delete data. Check external dependencies and existing data.',
            ...statements,
          ].join('\n\n'),
  };
}
