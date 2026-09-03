import { parseFieldType } from './databaseTypeMapping';
import {
  type DatabaseType,
  type PersistedState,
  type NormalizedField,
  type IndexDefinition,
  type FieldRow,
  type TableMiscConfig,
  type ForeignKeyDefinition,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';

import { buildCitusShardingDDL, buildMysqlPartitionClause } from './tableFeatures';
import { supportsMysqlPartition } from './databaseFamily';
import { resolveFieldComment } from './fieldComment';
import { getSqlIdentifierKey } from './sqlIdentifiers';

/**
 * 字段变更类型
 */
export type FieldDiffType = 'add' | 'remove' | 'modify' | 'rename';

/**
 * 字段属性变更类型
 */
export type FieldChangeType = 'type' | 'nullable' | 'default' | 'comment';

export type FieldChanges = readonly [FieldChangeType, ...FieldChangeType[]];

export type AddFieldDiff = {
  type: 'add';
  fieldName: string;
  newField: NormalizedField;
  oldField?: never;
  changes?: never;
  oldFieldName?: never;
  newFieldName?: never;
};

export type RemoveFieldDiff = {
  type: 'remove';
  fieldName: string;
  oldField: NormalizedField;
  newField?: never;
  changes?: never;
  oldFieldName?: never;
  newFieldName?: never;
};

export type ModifyFieldDiff = {
  type: 'modify';
  fieldName: string;
  oldField: NormalizedField;
  newField: NormalizedField;
  changes: FieldChanges;
  oldFieldName?: never;
  newFieldName?: never;
};

export type RenameFieldDiff = {
  type: 'rename';
  fieldName: string;
  oldField: NormalizedField;
  newField: NormalizedField;
  oldFieldName: string;
  newFieldName: string;
  changes?: FieldChanges;
};

/**
 * 字段变更详情
 */
export type FieldDiff = AddFieldDiff | RemoveFieldDiff | ModifyFieldDiff | RenameFieldDiff;

/**
 * 索引变更类型
 */
export type IndexDiffType = 'add' | 'remove';

/**
 * 索引变更详情
 */
export type IndexDiff = {
  type: IndexDiffType;
  index: IndexDefinition;
};

/**
 * 外键变更类型
 */
export type ForeignKeyDiffType = 'add' | 'remove';

/**
 * 外键变更详情
 */
export type ForeignKeyDiff = {
  type: ForeignKeyDiffType;
  foreignKey: ForeignKeyDefinition;
};

/**
 * 表结构变更汇总
 */
export type ManualSchemaChange =
  | 'objectType'
  | 'dbType'
  | 'view'
  | 'mysqlPartition'
  | 'citusSharding';

export type TableDiff = {
  manualChanges?: ManualSchemaChange[];
  oldDbType: DatabaseType;
  newDbType: DatabaseType;
  tableNameChanged: boolean;
  oldTableName: string;
  newTableName: string;
  oldSchemaName: string;
  newSchemaName: string;
  schemaNameChanged?: boolean;
  tableCommentChanged: boolean;
  oldTableComment?: string;
  newTableComment?: string;
  miscConfigChanged: boolean;
  oldMiscConfig?: TableMiscConfig;
  newMiscConfig?: TableMiscConfig;
  fields: FieldDiff[];
  indexes: IndexDiff[];
  unchangedIndexes?: IndexDefinition[];
  foreignKeys: ForeignKeyDiff[];
  unchangedForeignKeys?: ForeignKeyDefinition[];
};

export function hasTableChanges(diff: TableDiff): boolean {
  return (
    Boolean(diff.manualChanges?.length) ||
    diff.tableNameChanged ||
    Boolean(diff.schemaNameChanged) ||
    diff.tableCommentChanged ||
    diff.miscConfigChanged ||
    diff.fields.length > 0 ||
    diff.indexes.length > 0 ||
    diff.foreignKeys.length > 0
  );
}

/**
 * 将 FieldRow 转换为 NormalizedField
 *
 * 作为共享包不能假设调用方已把历史中文枚举值归一化，这里重新收敛一次。
 */
type DiffField = {
  id: string | null;
  field: NormalizedField;
};

function normalizeFieldRow(row: FieldRow): DiffField | null {
  const name = row.fieldName?.trim();
  if (!name) return null;

  return {
    id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null,
    field: {
      name,
      type: row.fieldType?.trim() || '',
      comment: resolveFieldComment({
        comment: row.fieldComment?.trim() || '',
        enumMeta: row.enumMeta,
      }),
      nullable: normalizeFieldNullable(row.nullable),
      defaultKind: normalizeFieldDefaultKind(row.defaultKind),
      defaultValue: row.defaultValue ?? '',
      onUpdate: normalizeFieldOnUpdate(row.onUpdate),
    },
  };
}

/**
 * 从 PersistedState 中提取有效字段列表
 */
function extractFields(state: PersistedState): DiffField[] {
  if (!state.rows) return [];
  return state.rows.map(normalizeFieldRow).filter((field): field is DiffField => field !== null);
}

/**
 * 比较两个字段是否相同
 */
const stableTypeKey = (type: string) => {
  const parsed = parseFieldType(type);
  return JSON.stringify([parsed.baseType, parsed.args, parsed.unsigned]);
};

function fieldsEqual(a: NormalizedField, b: NormalizedField): boolean {
  return (
    stableTypeKey(a.type) === stableTypeKey(b.type) &&
    a.nullable === b.nullable &&
    a.defaultKind === b.defaultKind &&
    a.defaultValue === b.defaultValue &&
    a.onUpdate === b.onUpdate &&
    a.comment === b.comment
  );
}

/**
 * 获取两个字段之间的差异
 */
function getFieldChanges(oldField: NormalizedField, newField: NormalizedField): FieldChangeType[] {
  const changes: FieldChangeType[] = [];

  if (stableTypeKey(oldField.type) !== stableTypeKey(newField.type)) {
    changes.push('type');
  }
  if (oldField.nullable !== newField.nullable) {
    changes.push('nullable');
  }
  if (
    oldField.defaultKind !== newField.defaultKind ||
    oldField.defaultValue !== newField.defaultValue ||
    oldField.onUpdate !== newField.onUpdate
  ) {
    changes.push('default');
  }
  if (oldField.comment !== newField.comment) {
    changes.push('comment');
  }

  return changes;
}

function toFieldChanges(changes: FieldChangeType[]): FieldChanges | null {
  const first = changes[0];
  return first ? [first, ...changes.slice(1)] : null;
}

function createMatchedFieldDiff(
  oldField: NormalizedField,
  newField: NormalizedField,
  dbType: PersistedState['dbType'],
) {
  const changes = getFieldChanges(oldField, newField);
  const fieldChanges = toFieldChanges(changes);
  if (getSqlIdentifierKey(oldField.name, dbType) !== getSqlIdentifierKey(newField.name, dbType)) {
    return {
      type: 'rename',
      fieldName: newField.name,
      oldField,
      newField,
      oldFieldName: oldField.name,
      newFieldName: newField.name,
      ...(fieldChanges ? { changes: fieldChanges } : {}),
    } satisfies FieldDiff;
  }
  if (fieldsEqual(oldField, newField)) return null;
  if (!fieldChanges) return null;
  return {
    type: 'modify',
    fieldName: newField.name,
    oldField,
    newField,
    changes: fieldChanges,
  } satisfies FieldDiff;
}

function diffFields(
  oldFields: DiffField[],
  newFields: DiffField[],
  dbType: PersistedState['dbType'],
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const unmatchedOld = new Set(oldFields.map((_, index) => index));
  const unmatchedNew = new Set(newFields.map((_, index) => index));

  const match = (oldIndex: number, newIndex: number) => {
    unmatchedOld.delete(oldIndex);
    unmatchedNew.delete(newIndex);
    const diff = createMatchedFieldDiff(
      oldFields[oldIndex].field,
      newFields[newIndex].field,
      dbType,
    );
    if (diff) diffs.push(diff);
  };

  const newIndexById = new Map(
    newFields.flatMap((field, index) => (field.id ? [[field.id, index] as const] : [])),
  );
  oldFields.forEach((field, oldIndex) => {
    if (!field.id) return;
    const newIndex = newIndexById.get(field.id);
    if (newIndex !== undefined && unmatchedNew.has(newIndex)) match(oldIndex, newIndex);
  });

  for (const oldIndex of Array.from(unmatchedOld)) {
    const oldField = oldFields[oldIndex];
    const candidates = Array.from(unmatchedNew).filter((newIndex) => {
      const newField = newFields[newIndex];
      return (
        getSqlIdentifierKey(oldField.field.name, dbType) ===
        getSqlIdentifierKey(newField.field.name, dbType)
      );
    });
    if (candidates.length === 1) match(oldIndex, candidates[0]);
  }

  for (const oldIndex of unmatchedOld) {
    const oldField = oldFields[oldIndex].field;
    diffs.push({ type: 'remove', fieldName: oldField.name, oldField });
  }
  for (const newIndex of unmatchedNew) {
    const newField = newFields[newIndex].field;
    diffs.push({ type: 'add', fieldName: newField.name, newField });
  }
  return diffs;
}

function normalizeMiscConfig(config?: TableMiscConfig): TableMiscConfig {
  if (!config?.enabled) return { enabled: false };
  const partitions = config.partitions?.enabled
    ? {
        enabled: true,
        columns: config.partitions.columns.map((column) => ({
          name: column.name.trim(),
          type: column.type.trim(),
          comment: column.comment.trim(),
        })),
        ...(config.partitions.clustering?.enabled
          ? {
              clustering: {
                enabled: true,
                columns: config.partitions.clustering.columns.map((column) => column.trim()),
                bucketCount: config.partitions.clustering.bucketCount,
              },
            }
          : {}),
      }
    : undefined;
  return {
    enabled: true,
    engine: config.engine?.trim() || '',
    charset: config.charset?.trim() || '',
    collation: config.collation?.trim() || '',
    tablespace: config.tablespace?.trim() || '',
    fillfactor: config.fillfactor,
    pctfree: config.pctfree,
    initrans: config.initrans,
    storedAs: config.storedAs || '',
    external: config.external === true,
    location: config.location?.trim() || '',
    ...(partitions ? { partitions } : {}),
  };
}

/**
 * 生成索引的唯一标识（用于比较）
 */
function getIndexSignature(index: IndexDefinition, dbType: PersistedState['dbType']): string {
  const prefix =
    index.kind === 'primary'
      ? 'PK'
      : index.kind === 'unique_constraint'
        ? 'UC'
        : index.kind !== 'index'
          ? 'UQ'
          : 'IX';
  return JSON.stringify([
    prefix,
    getSqlIdentifierKey(index.name, dbType),
    index.fields.map((field) => [getSqlIdentifierKey(field.name, dbType), field.direction]),
  ]);
}

function getForeignKeySignature(
  foreignKey: ForeignKeyDefinition,
  dbType: PersistedState['dbType'],
): string {
  return JSON.stringify([
    getSqlIdentifierKey(foreignKey.name, dbType),
    foreignKey.fields.map((field) => getSqlIdentifierKey(field, dbType)),
    getSqlIdentifierKey(foreignKey.refSchema || '', dbType),
    getSqlIdentifierKey(foreignKey.refTable, dbType),
    foreignKey.refFields.map((field) => getSqlIdentifierKey(field, dbType)),
    foreignKey.onDelete || '',
    foreignKey.onUpdate || '',
  ]);
}

function getManualSchemaChanges(
  oldState: PersistedState,
  newState: PersistedState,
  hasStructuralChanges: boolean,
): ManualSchemaChange[] {
  const changes: ManualSchemaChange[] = [];
  const oldType = oldState.objectType ?? 'table';
  const newType = newState.objectType ?? 'table';
  if (oldType !== newType) changes.push('objectType');
  if (oldState.dbType !== newState.dbType) changes.push('dbType');
  if (
    oldType === 'view' &&
    newType === 'view' &&
    (hasStructuralChanges ||
      (oldState.viewDefinition ?? '').trim() !== (newState.viewDefinition ?? '').trim() ||
      (oldState.viewCreateOrReplace !== false) !== (newState.viewCreateOrReplace !== false))
  )
    changes.push('view');

  const partitionClause = (state: PersistedState) =>
    supportsMysqlPartition(state.dbType) && state.mysqlPartitionConfig
      ? buildMysqlPartitionClause(state.mysqlPartitionConfig)
      : '';
  if (partitionClause(oldState) !== partitionClause(newState)) changes.push('mysqlPartition');

  const shardingDDL = (state: PersistedState) =>
    state.dbType === 'postgresql-citus' && state.citusShardingConfig
      ? buildCitusShardingDDL('', state.citusShardingConfig)
      : '';
  if (shardingDDL(oldState) !== shardingDDL(newState)) changes.push('citusSharding');
  return changes;
}

/**
 * 对比两个 PersistedState，生成变更详情
 */
export function diffPersistedState(oldState: PersistedState, newState: PersistedState): TableDiff {
  const dbType = newState.dbType;
  const result: TableDiff = {
    oldDbType: oldState.dbType,
    newDbType: newState.dbType,
    tableNameChanged: false,
    oldTableName: oldState.tableName?.trim() || '',
    newTableName: newState.tableName?.trim() || '',
    oldSchemaName: oldState.schemaName?.trim() || '',
    newSchemaName: newState.schemaName?.trim() || '',
    schemaNameChanged: false,
    tableCommentChanged: false,
    miscConfigChanged: false,
    fields: [],
    indexes: [],
    foreignKeys: [],
  };

  // 1. 表名变更
  if (
    getSqlIdentifierKey(result.oldSchemaName || '', dbType) !==
    getSqlIdentifierKey(result.newSchemaName || '', dbType)
  ) {
    result.schemaNameChanged = true;
  }
  const oldTableName = oldState.tableName?.trim() || '';
  const newTableName = newState.tableName?.trim() || '';
  if (getSqlIdentifierKey(oldTableName, dbType) !== getSqlIdentifierKey(newTableName, dbType)) {
    result.tableNameChanged = true;
    result.oldTableName = oldTableName;
    result.newTableName = newTableName;
  }

  // 2. 表注释变更
  const oldTableComment = oldState.tableComment?.trim() || '';
  const newTableComment = newState.tableComment?.trim() || '';
  if (oldTableComment !== newTableComment) {
    result.tableCommentChanged = true;
    result.oldTableComment = oldTableComment;
    result.newTableComment = newTableComment;
  }

  // 2.5 杂项设置变更
  const oldMiscConfig = normalizeMiscConfig(oldState.tableMiscConfig);
  const newMiscConfig = normalizeMiscConfig(newState.tableMiscConfig);
  if (JSON.stringify(oldMiscConfig) !== JSON.stringify(newMiscConfig)) {
    result.miscConfigChanged = true;
    result.oldMiscConfig = oldMiscConfig;
    result.newMiscConfig = newMiscConfig;
  }

  // 3. 字段变更
  const oldFields = extractFields(oldState);
  const newFields = extractFields(newState);
  result.fields = diffFields(oldFields, newFields, dbType);

  // 4. 索引变更
  const oldIndexes = oldState.indexes || [];
  const newIndexes = newState.indexes || [];

  const oldIndexSigs = new Map<string, IndexDefinition>();
  for (const idx of oldIndexes) {
    oldIndexSigs.set(getIndexSignature(idx, dbType), idx);
  }

  const newIndexSigs = new Map<string, IndexDefinition>();
  for (const idx of newIndexes) {
    newIndexSigs.set(getIndexSignature(idx, dbType), idx);
  }

  // 检测删除的索引
  for (const [sig, idx] of oldIndexSigs) {
    if (!newIndexSigs.has(sig)) {
      result.indexes.push({ type: 'remove', index: idx });
    } else {
      (result.unchangedIndexes ??= []).push(idx);
    }
  }

  // 检测新增的索引
  for (const [sig, idx] of newIndexSigs) {
    if (!oldIndexSigs.has(sig)) {
      result.indexes.push({ type: 'add', index: idx });
    }
  }

  // 5. 外键变更
  const oldForeignKeys = oldState.foreignKeys || [];
  const newForeignKeys = newState.foreignKeys || [];

  const oldFkSigs = new Map<string, ForeignKeyDefinition>();
  for (const fk of oldForeignKeys) {
    oldFkSigs.set(getForeignKeySignature(fk, dbType), fk);
  }

  const newFkSigs = new Map<string, ForeignKeyDefinition>();
  for (const fk of newForeignKeys) {
    newFkSigs.set(getForeignKeySignature(fk, dbType), fk);
  }

  // 检测删除的外键
  for (const [sig, fk] of oldFkSigs) {
    if (!newFkSigs.has(sig)) {
      result.foreignKeys.push({ type: 'remove', foreignKey: fk });
    } else {
      (result.unchangedForeignKeys ??= []).push(fk);
    }
  }

  // 检测新增的外键
  for (const [sig, fk] of newFkSigs) {
    if (!oldFkSigs.has(sig)) {
      result.foreignKeys.push({ type: 'add', foreignKey: fk });
    }
  }

  const manualChanges = getManualSchemaChanges(oldState, newState, hasTableChanges(result));
  if (manualChanges.length > 0) {
    result.manualChanges = manualChanges;
  }

  return result;
}
