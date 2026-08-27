import type { NormalizedField, DatabaseType } from '@ddlbuilder/shared-types';
import type { FieldDiff, ManualSchemaChange, TableDiff } from '../tableDiff';
import {
  generateTableCommentAlter,
  generateDropColumn,
  generateRenameColumn,
  generateAddColumn,
  generateModifyColumn,
} from './columnStatements';
import { generateDropIndex, generateAddIndex } from './indexStatements';
import { generateDropForeignKey, generateAddForeignKey } from './foreignKeyStatements';
import {
  generateRenameTable,
  generateTableOptionsChangeNotice,
  generateTableSchemaChange,
} from './tableStatements';
import { buildQualifiedTableName, getSchemaAndTable } from '../databaseTypeMapping';
import { getDatabaseFamily } from '../databaseFamily';
import { getSqlServerColumnChangeNotice } from './sqlServerColumnStatements';

const MANUAL_CHANGE_DESCRIPTIONS: Record<ManualSchemaChange, string> = {
  objectType: 'schema object type',
  dbType: 'database dialect',
  view: 'view definition or structure',
  mysqlPartition: 'table partitioning',
  citusSharding: 'Citus distribution',
};

function orderFieldRenames(fields: FieldDiff[], dbType: DatabaseType): FieldDiff[] | null {
  const renames = fields.filter(
    (field) => field.type === 'rename' && field.oldFieldName && field.newFieldName,
  );
  const key = (name: string | undefined) => {
    const value = name?.trim() ?? '';
    return getDatabaseFamily(dbType) === 'postgresql' ? value : value.toLowerCase();
  };
  const oldNames = new Set(renames.map((field) => key(field.oldFieldName)));
  const byTarget = new Map(renames.map((field) => [key(field.newFieldName), field]));
  const ordered = renames.filter((field) => !oldNames.has(key(field.newFieldName)));
  for (const field of ordered) {
    byTarget.delete(key(field.newFieldName));
    const waiting = byTarget.get(key(field.oldFieldName));
    if (waiting) ordered.push(waiting);
  }
  return ordered.length === renames.length ? ordered : null;
}

/**
 * ALTER DDL 生成器
 * 根据 TableDiff 生成各数据库的 ALTER TABLE 语句
 */
export function generateAlterDDL(
  tableName: string,
  diff: TableDiff,
  _fields: NormalizedField[],
  dbType: DatabaseType,
): string {
  if (!diff.hasChanges) {
    return '';
  }

  const statements: string[] = [];
  const fallback = getSchemaAndTable(tableName);
  let oldTableName = buildQualifiedTableName(
    diff.oldSchemaName ?? fallback.schema,
    diff.oldTableName || fallback.table,
    dbType,
  );
  const activeTableName = buildQualifiedTableName(
    diff.newSchemaName ?? fallback.schema,
    diff.newTableName || fallback.table,
    dbType,
  );

  if (diff.manualChanges?.length) {
    const reasons = diff.manualChanges
      .map((change) => MANUAL_CHANGE_DESCRIPTIONS[change])
      .join(', ');
    return `-- Manual migration required: ${reasons} changed from ${oldTableName} to ${activeTableName} (${dbType}). No automatic changes generated.`;
  }

  if (dbType === 'sqlserver') {
    for (const field of diff.fields) {
      const notice = getSqlServerColumnChangeNotice(field);
      if (notice) return notice;
    }
  }

  const renames = orderFieldRenames(diff.fields, dbType);
  if (!renames) {
    return `-- Manual migration required: cyclic column renames in ${oldTableName} (${dbType}). No automatic changes generated.`;
  }

  if (diff.schemaNameChanged) {
    const newSchema = diff.newSchemaName ?? '';
    const statement = generateTableSchemaChange(oldTableName, newSchema, dbType);
    if (!statement) {
      return `-- Manual migration required: schema change from ${oldTableName} to ${activeTableName} (${dbType}). No automatic changes generated.`;
    }
    statements.push(statement);
    oldTableName = buildQualifiedTableName(
      newSchema,
      getSchemaAndTable(oldTableName).table,
      dbType,
    );
  }

  if (diff.tableNameChanged) {
    statements.push(generateRenameTable(oldTableName, activeTableName, dbType));
  }

  // 表注释变更 (某些数据库支持)
  if (diff.tableCommentChanged) {
    const commentSql = generateTableCommentAlter(
      activeTableName,
      diff.newTableComment || '',
      dbType,
    );
    if (commentSql) {
      statements.push(commentSql);
    }
  }

  for (const fkDiff of (diff.foreignKeys || []).filter((f) => f.type === 'remove')) {
    statements.push(generateDropForeignKey(activeTableName, fkDiff, dbType));
  }

  // 1. 处理删除的索引（先删索引，再改字段）
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'remove')) {
    statements.push(generateDropIndex(activeTableName, idxDiff, dbType));
  }

  // 2. 处理删除的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'remove')) {
    statements.push(generateDropColumn(activeTableName, fieldDiff, dbType));
  }

  // 3. 处理重命名的字段（在删除之后、新增之前）
  for (const fieldDiff of renames) {
    statements.push(generateRenameColumn(activeTableName, fieldDiff, dbType));
    if (fieldDiff.changes?.length && fieldDiff.newField) {
      statements.push(
        generateModifyColumn(
          activeTableName,
          {
            ...fieldDiff,
            type: 'modify',
            fieldName: fieldDiff.newField.name,
          },
          dbType,
        ),
      );
    }
  }

  // 4. 处理新增的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'add')) {
    statements.push(generateAddColumn(activeTableName, fieldDiff, dbType));
  }

  // 5. 处理修改的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'modify')) {
    statements.push(generateModifyColumn(activeTableName, fieldDiff, dbType));
  }

  // 6. 处理新增的索引
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'add')) {
    statements.push(generateAddIndex(activeTableName, idxDiff, dbType));
  }

  // 7. 处理新增的外键
  for (const fkDiff of (diff.foreignKeys || []).filter((f) => f.type === 'add')) {
    statements.push(generateAddForeignKey(activeTableName, fkDiff, dbType));
  }

  if (diff.miscConfigChanged) {
    statements.push(generateTableOptionsChangeNotice(activeTableName, dbType));
  }

  return statements.filter((s) => s.trim()).join('\n\n');
}
