import * as Y from 'yjs';
import { isDatabaseType, isIndexKind } from '@ddlbuilder/shared-types';
import { tableDocToSchemaDocumentState } from './workspaceTableDoc';
import { isRecord, readJsonMap, readMap } from './yMapJson';

function invalid(path: string, expected: string): never {
  throw new Error(`${path} must be ${expected}`);
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') invalid(path, 'a string');
}

function assertStringArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value)) invalid(path, 'an array');
  value.forEach((item, index) => assertString(item, `${path}[${index}]`));
}

function assertOptionalFieldIds(
  value: unknown,
  path: string,
): asserts value is Array<string | null> | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value)) invalid(path, 'an array');
  value.forEach((item, index) => {
    if (item !== null && typeof item !== 'string') {
      invalid(`${path}[${index}]`, 'a string or null');
    }
  });
}

const assertIndex = (value: unknown, path: string) => {
  if (!isRecord(value)) invalid(path, 'an object');
  assertString(value.id, `${path}.id`);
  assertString(value.name, `${path}.name`);
  if (!isIndexKind(value.kind)) invalid(`${path}.kind`, 'a supported index kind');
  if (!Array.isArray(value.fields)) invalid(`${path}.fields`, 'an array');
  value.fields.forEach((field, index) => {
    const fieldPath = `${path}.fields[${index}]`;
    if (!isRecord(field)) invalid(fieldPath, 'an object');
    assertString(field.name, `${fieldPath}.name`);
    if (field.direction !== 'ASC' && field.direction !== 'DESC') {
      invalid(`${fieldPath}.direction`, 'ASC or DESC');
    }
    if (field.fieldId !== undefined) assertString(field.fieldId, `${fieldPath}.fieldId`);
  });
};

const assertForeignKey = (value: unknown, path: string) => {
  if (!isRecord(value)) invalid(path, 'an object');
  assertString(value.id, `${path}.id`);
  assertString(value.name, `${path}.name`);
  assertStringArray(value.fields, `${path}.fields`);
  assertString(value.refTable, `${path}.refTable`);
  assertStringArray(value.refFields, `${path}.refFields`);
  assertOptionalFieldIds(value.localFieldIds, `${path}.localFieldIds`);
};

const assertOrderedMap = (
  tableDoc: Y.Map<unknown>,
  mapKey: string,
  orderKey: string,
  path: string,
  assertEntry: (value: unknown, path: string) => void,
) => {
  const map = readMap(tableDoc, mapKey);
  const order = tableDoc.get(orderKey);
  if (!map && order === undefined) return false;
  if (!map) invalid(`${path}.${mapKey}`, 'a Y.Map');
  if (!(order instanceof Y.Array)) invalid(`${path}.${orderKey}`, 'a Y.Array');
  const ids = order.toArray();
  ids.forEach((id, index) => assertString(id, `${path}.${orderKey}[${index}]`));
  for (const [id, value] of map.entries()) {
    assertEntry(readJsonMap(value), `${path}.${mapKey}.${id}`);
  }
  return true;
};

const assertFieldMap = (tableDoc: Y.Map<unknown>, path: string) => {
  const fields = readMap(tableDoc, 'fields');
  const order = tableDoc.get('fieldOrder');
  if (!fields && order === undefined) return;
  if (!fields) invalid(`${path}.fields`, 'a Y.Map');
  if (!(order instanceof Y.Array)) invalid(`${path}.fieldOrder`, 'a Y.Array');
  const ids = order.toArray();
  ids.forEach((id, index) => assertString(id, `${path}.fieldOrder[${index}]`));
  for (const [id, value] of fields.entries()) {
    const field = readJsonMap(value);
    const fieldPath = `${path}.fields.${id}`;
    for (const key of [
      'fieldName',
      'fieldType',
      'fieldComment',
      'defaultKind',
      'defaultValue',
      'onUpdate',
    ]) {
      const value = field[key];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        invalid(`${fieldPath}.${key}`, 'a string or null');
      }
    }
    const nullable = field.nullable;
    if (
      nullable !== undefined &&
      nullable !== null &&
      typeof nullable !== 'boolean' &&
      typeof nullable !== 'string'
    ) {
      invalid(`${fieldPath}.nullable`, 'a boolean, string, or null');
    }
    if (field.enumMeta !== undefined && field.enumMeta !== null && !Array.isArray(field.enumMeta)) {
      invalid(`${fieldPath}.enumMeta`, 'an array or null');
    }
  }
};

const assertScalarReferences = (tableDoc: Y.Map<unknown>, path: string) => {
  const snapshot = tableDoc.get('stateSnapshot');
  if (!isRecord(snapshot)) invalid(`${path}.stateSnapshot`, 'an object');
  for (const key of ['tableName', 'tableComment', 'authInput']) {
    assertString(snapshot[key], `${path}.stateSnapshot.${key}`);
  }
  if (!isDatabaseType(snapshot.dbType)) {
    invalid(`${path}.stateSnapshot.dbType`, 'a supported database type');
  }
  if (!Array.isArray(snapshot.rows)) invalid(`${path}.stateSnapshot.rows`, 'an array');
  if (!Array.isArray(snapshot.indexes)) invalid(`${path}.stateSnapshot.indexes`, 'an array');
  assertStringArray(snapshot.authObjects, `${path}.stateSnapshot.authObjects`);

  const scalar = readMap(tableDoc, 'scalar');
  const valueOf = (key: string) => (scalar?.has(key) ? scalar.get(key) : snapshot[key]);
  const citus = valueOf('citusShardingConfig');
  if (citus !== undefined) {
    if (!isRecord(citus)) invalid(`${path}.scalar.citusShardingConfig`, 'an object');
    if (citus.distributionColumn !== undefined) {
      assertString(
        citus.distributionColumn,
        `${path}.scalar.citusShardingConfig.distributionColumn`,
      );
    }
    if (citus.distributionColumnFieldId !== undefined) {
      assertString(
        citus.distributionColumnFieldId,
        `${path}.scalar.citusShardingConfig.distributionColumnFieldId`,
      );
    }
  }

  const mysql = valueOf('mysqlPartitionConfig');
  if (mysql !== undefined) {
    if (!isRecord(mysql)) invalid(`${path}.scalar.mysqlPartitionConfig`, 'an object');
    assertStringArray(mysql.columns, `${path}.scalar.mysqlPartitionConfig.columns`);
    assertOptionalFieldIds(
      mysql.columnFieldIds,
      `${path}.scalar.mysqlPartitionConfig.columnFieldIds`,
    );
  }

  const misc = valueOf('tableMiscConfig');
  if (misc === undefined) return;
  if (!isRecord(misc)) invalid(`${path}.scalar.tableMiscConfig`, 'an object');
  if (misc.partitions === undefined) return;
  if (!isRecord(misc.partitions)) invalid(`${path}.scalar.tableMiscConfig.partitions`, 'an object');
  const clustering = misc.partitions.clustering;
  if (clustering === undefined) return;
  if (!isRecord(clustering)) {
    invalid(`${path}.scalar.tableMiscConfig.partitions.clustering`, 'an object');
  }
  assertStringArray(
    clustering.columns,
    `${path}.scalar.tableMiscConfig.partitions.clustering.columns`,
  );
  assertOptionalFieldIds(
    clustering.columnFieldIds,
    `${path}.scalar.tableMiscConfig.partitions.clustering.columnFieldIds`,
  );
};

export const assertTableDocDecodable = (tableDoc: Y.Map<unknown>, path: string) => {
  assertScalarReferences(tableDoc, path);
  assertFieldMap(tableDoc, path);
  const hasIndexes = assertOrderedMap(tableDoc, 'indexes', 'indexOrder', path, assertIndex);
  const hasForeignKeys = assertOrderedMap(
    tableDoc,
    'foreignKeys',
    'foreignKeyOrder',
    path,
    assertForeignKey,
  );
  const snapshot = tableDoc.get('stateSnapshot') as Record<string, unknown>;
  if (!hasIndexes) {
    const indexes = snapshot.indexes;
    if (!Array.isArray(indexes)) invalid(`${path}.stateSnapshot.indexes`, 'an array');
    indexes.forEach((index, position) =>
      assertIndex(index, `${path}.stateSnapshot.indexes[${position}]`),
    );
  }
  if (!hasForeignKeys && snapshot.foreignKeys !== undefined) {
    if (!Array.isArray(snapshot.foreignKeys)) {
      invalid(`${path}.stateSnapshot.foreignKeys`, 'an array');
    }
    snapshot.foreignKeys.forEach((foreignKey, position) =>
      assertForeignKey(foreignKey, `${path}.stateSnapshot.foreignKeys[${position}]`),
    );
  }
  tableDocToSchemaDocumentState(tableDoc);
};
