import type { DatabaseType } from '@ddlbuilder/shared-types';
import {
  hasTableChanges,
  type ManualSchemaChange,
  type ModifyFieldDiff,
  type RenameFieldDiff,
  type TableDiff,
} from '../tableDiff';
import {
  generateTableCommentAlter,
  generateDropColumn,
  generateRenameColumn,
  generateAddColumn,
  generateModifyColumn,
} from './columnStatements';
import { generateDropIndex, generateAddIndex, generateRenameIndex } from './indexStatements';
import { generateDropForeignKey, generateAddForeignKey } from './foreignKeyStatements';
import {
  generateRenameTable,
  generateTableOptionsChangeNotice,
  generateTableSchemaChange,
} from './tableStatements';
import { buildQualifiedTableName, getSchemaAndTable } from '../databaseTypeMapping';
import { getDatabaseFamily } from '../databaseFamily';
import { generateMysqlAlterStatement } from './mysqlAlterStatement';
import { getForeignKeyIssue } from '../foreignKeys';
import { getSqlIdentifierKey } from '../sqlIdentifiers';
import { planDependencies } from './planDependencies';

const MANUAL_CHANGE_DESCRIPTIONS: Record<ManualSchemaChange, string> = {
  objectType: 'schema object type',
  dbType: 'database dialect',
  view: 'view definition or structure',
  mysqlPartition: 'table partitioning',
  citusSharding: 'Citus distribution',
};

function orderFieldRenames(fields: TableDiff['fields'], dbType: DatabaseType) {
  const renames = fields.filter((field): field is RenameFieldDiff => field.type === 'rename');
  const key = (name: string) => getSqlIdentifierKey(name, dbType);
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
export function generateAlterDDL(diff: TableDiff): string {
  if (!hasTableChanges(diff)) {
    return '';
  }

  const dbType = diff.newDbType;
  const statements: string[] = [];
  let oldTableName = buildQualifiedTableName(diff.oldSchemaName, diff.oldTableName, dbType);
  const activeTableName = buildQualifiedTableName(diff.newSchemaName, diff.newTableName, dbType);

  if (diff.manualChanges?.length) {
    const reasons = diff.manualChanges
      .map((change) => MANUAL_CHANGE_DESCRIPTIONS[change])
      .join(', ');
    return `-- Manual migration required: ${reasons} changed from ${oldTableName} to ${activeTableName} (${dbType}). No automatic changes generated.`;
  }

  const renames = orderFieldRenames(diff.fields, dbType);
  if (!renames) {
    return `-- Manual migration required: cyclic column renames in ${oldTableName} (${dbType}). No automatic changes generated.`;
  }

  const dependencies = planDependencies(oldTableName, diff, dbType);
  if (dependencies.error !== undefined) {
    return `-- Manual migration required: ${dependencies.error} in ${oldTableName} (${dbType}). No automatic changes generated.`;
  }
  const { indexes, foreignKeys, indexRenames } = dependencies;
  if (dependencies.needsExternalDependencyReview) {
    statements.push(
      '-- Manual migration required for foreign keys from other tables that reference changed columns or keys. Their definitions are not available in this single-table diff; coordinate those changes before running this SQL.',
    );
  }

  if (diff.schemaNameChanged) {
    const newSchema = diff.newSchemaName;
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
      diff.oldTableComment,
    );
    if (commentSql) {
      statements.push(commentSql);
    }
  }

  for (const fkDiff of foreignKeys.filter((f) => f.type === 'remove')) {
    const replacement = foreignKeys.find(
      (change) =>
        change.type === 'add' &&
        getSqlIdentifierKey(change.foreignKey.name, dbType) ===
          getSqlIdentifierKey(fkDiff.foreignKey.name, dbType),
    );
    if (replacement && getForeignKeyIssue(replacement.foreignKey, dbType)) continue;
    statements.push(generateDropForeignKey(activeTableName, fkDiff, dbType));
  }

  for (const { oldIndex, newIndex } of indexRenames) {
    statements.push(generateRenameIndex(activeTableName, oldIndex, newIndex, dbType));
  }

  if (getDatabaseFamily(dbType) === 'mysql') {
    statements.push(generateMysqlAlterStatement(activeTableName, { ...diff, indexes }, dbType));
  } else {
    for (const idxDiff of indexes.filter((i) => i.type === 'remove')) {
      statements.push(generateDropIndex(activeTableName, idxDiff, dbType));
    }

    // 2. 处理删除的字段
    for (const fieldDiff of diff.fields.filter((f) => f.type === 'remove')) {
      statements.push(generateDropColumn(activeTableName, fieldDiff, dbType));
    }

    // 3. 处理重命名的字段（在删除之后、新增之前）
    for (const fieldDiff of renames) {
      statements.push(generateRenameColumn(activeTableName, fieldDiff, dbType));
      if (fieldDiff.changes) {
        const modification: ModifyFieldDiff = {
          type: 'modify',
          fieldName: fieldDiff.newField.name,
          oldField: fieldDiff.oldField,
          newField: fieldDiff.newField,
          changes: fieldDiff.changes,
        };
        statements.push(generateModifyColumn(activeTableName, modification, dbType));
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
    for (const idxDiff of indexes.filter((i) => i.type === 'add')) {
      statements.push(generateAddIndex(activeTableName, idxDiff, dbType));
    }
  }

  // 7. 处理新增的外键
  for (const fkDiff of foreignKeys.filter((f) => f.type === 'add')) {
    statements.push(generateAddForeignKey(activeTableName, fkDiff, dbType));
  }

  if (diff.miscConfigChanged) {
    statements.push(generateTableOptionsChangeNotice(activeTableName, dbType));
  }

  return statements.filter((s) => s.trim()).join('\n\n');
}
