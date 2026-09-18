import { supportsMysqlPartition } from './databaseFamily';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { indexSnapshot, snapshotTableKey, snapshotTableLabel } from './schemaSnapshot';
import { getSqlIdentifierKey } from './sqlIdentifiers';
import { sqlExpressionReferencesField } from './sqlExpressionIdentifiers';

export type FieldImpactKind =
  | 'index'
  | 'foreignKey'
  | 'logicalRelation'
  | 'mysqlPartition'
  | 'citusDistribution'
  | 'hivePartition'
  | 'hiveClustering';

export interface FieldImpactDependency {
  kind: FieldImpactKind;
  table: string;
  name: string;
  fields: string[];
  detail: string;
  relatedTable?: string;
  relatedFields?: string[];
  direction?: 'incoming' | 'outgoing' | 'self';
}

export interface FieldImpactReport {
  table: string;
  field: string;
  dbType: PersistedState['dbType'];
  tablesChecked: number;
  viewsExcluded: string[];
  externalRelations: string[];
  dependencies: FieldImpactDependency[];
}

export function impactFieldNames(table: PersistedState): string[] {
  const names = table.rows.flatMap((row) => (row.fieldName.trim() ? [row.fieldName.trim()] : []));
  const partition = table.tableMiscConfig?.partitions;

  if (table.dbType === 'hive' && partition?.enabled) {
    for (const column of partition.columns) {
      if (
        !names.some(
          (name) =>
            getSqlIdentifierKey(name, table.dbType) ===
            getSqlIdentifierKey(column.name, table.dbType),
        )
      )
        names.push(column.name);
    }
  }

  return names;
}

export function analyzeFieldImpact(
  tables: PersistedState[],
  tableKey: string,
  fieldName: string,
): FieldImpactReport {
  const indexed = indexSnapshot(tables);
  const target = indexed.get(tableKey);

  if (!target || target.objectType === 'view')
    throw new Error('Select a table in the analysis scope.');

  if (tables.some((table) => table.dbType !== target.dbType))
    throw new Error('Select tables from one database dialect.');
  const key = (name: string) => getSqlIdentifierKey(name, target.dbType);

  for (const table of tables) {
    const fields = table.rows.flatMap((row) => (row.fieldName.trim() ? [key(row.fieldName)] : []));

    if (new Set(fields).size !== fields.length)
      throw new Error(`Duplicate fields: ${snapshotTableLabel(table)}`);
  }

  const field = impactFieldNames(target).find((name) => key(name) === key(fieldName));

  if (!field) throw new Error('Select an existing field.');
  const references = (names: string[]) => names.some((name) => key(name) === key(field));
  const dependencies: FieldImpactDependency[] = [];
  const externalRelations: string[] = [];
  const label = snapshotTableLabel(target);
  const ordinary = tables.filter((table) => table.objectType !== 'view');

  for (const index of target.indexes) {
    if (references(index.fields.map((column) => column.name)))
      dependencies.push({
        kind: 'index',
        table: label,
        name: index.name,
        fields: index.fields.map((column) => column.name),
        detail: index.kind,
      });
  }

  for (const table of ordinary) {
    for (const relation of table.foreignKeys ?? []) {
      const sourceKey = snapshotTableKey(table);

      const referenceKey = snapshotTableKey(
        table,
        relation.refTable,
        relation.refSchema || table.schemaName,
      );
      const relatedTable = [relation.refSchema || table.schemaName, relation.refTable]
        .filter(Boolean)
        .join('.');
      const parent = indexed.get(referenceKey);

      if (!parent || parent.objectType === 'view')
        externalRelations.push(`${snapshotTableLabel(table)}.${relation.name} → ${relatedTable}`);
      const outgoing = sourceKey === tableKey && references(relation.fields);
      const incoming = referenceKey === tableKey && references(relation.refFields);

      if (!outgoing && !incoming) continue;
      dependencies.push({
        kind: relation.logical ? 'logicalRelation' : 'foreignKey',
        table: snapshotTableLabel(table),
        name: relation.name,
        fields: [...relation.fields],
        relatedTable,
        relatedFields: [...relation.refFields],
        direction: incoming && outgoing ? 'self' : incoming ? 'incoming' : 'outgoing',
        detail:
          relation.logical?.description ??
          [
            relation.onDelete && `ON DELETE ${relation.onDelete}`,
            relation.onUpdate && `ON UPDATE ${relation.onUpdate}`,
          ]
            .filter(Boolean)
            .join('; '),
      });
    }
  }

  const partition = target.mysqlPartitionConfig;

  if (
    supportsMysqlPartition(target.dbType) &&
    partition?.enabled &&
    (references(partition.columns) ||
      (partition.expression &&
        sqlExpressionReferencesField(partition.expression, field, target.dbType)))
  )
    dependencies.push({
      kind: 'mysqlPartition',
      table: label,
      name: partition.type,
      fields: [...partition.columns],
      detail: partition.expression ?? '',
    });
  const sharding = target.citusShardingConfig;

  if (
    target.dbType === 'postgresql-citus' &&
    sharding?.mode === 'distributed' &&
    sharding.distributionColumn &&
    references([sharding.distributionColumn])
  )
    dependencies.push({
      kind: 'citusDistribution',
      table: label,
      name: 'distributed',
      fields: [sharding.distributionColumn],
      detail: '',
    });
  const hive = target.tableMiscConfig?.partitions;

  if (target.dbType === 'hive' && hive?.enabled) {
    if (references(hive.columns.map((column) => column.name)))
      dependencies.push({
        kind: 'hivePartition',
        table: label,
        name: 'PARTITIONED BY',
        fields: hive.columns.map((column) => column.name),
        detail: '',
      });

    if (hive.clustering?.enabled && references(hive.clustering.columns))
      dependencies.push({
        kind: 'hiveClustering',
        table: label,
        name: 'CLUSTERED BY',
        fields: [...hive.clustering.columns],
        detail: `${hive.clustering.bucketCount} BUCKETS`,
      });
  }

  return {
    table: label,
    field,
    dbType: target.dbType,
    tablesChecked: ordinary.length,
    viewsExcluded: tables.flatMap((table) =>
      table.objectType === 'view' ? [snapshotTableLabel(table)] : [],
    ),
    externalRelations,
    dependencies,
  };
}
