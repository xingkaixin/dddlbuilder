import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { FieldDiff, IndexDiff, TableDiff } from '../tableDiff';
import { formatSqlIdentifier } from '../sqlIdentifiers';
import { formatSqlTableName } from '../databaseTypeMapping';
import { buildColumnDefinition } from './columnStatements';

function buildColumnClause(change: FieldDiff, dbType: DatabaseType): string {
  if (change.type === 'remove') {
    return `DROP COLUMN ${formatSqlIdentifier(change.fieldName, dbType)}`;
  }
  if (change.type === 'rename') {
    if (!change.oldFieldName || !change.newFieldName) return '';
    const oldName = formatSqlIdentifier(change.oldFieldName, dbType);
    const newName = formatSqlIdentifier(change.newFieldName, dbType);
    if (change.changes?.length && change.newField) {
      return `CHANGE COLUMN ${oldName} ${newName} ${buildColumnDefinition(change.newField, dbType)}`;
    }
    return `RENAME COLUMN ${oldName} TO ${newName}`;
  }
  if (!change.newField) return '';
  const field = change.newField;
  const action = change.type === 'add' ? 'ADD' : 'MODIFY';
  return `${action} COLUMN ${formatSqlIdentifier(field.name, dbType)} ${buildColumnDefinition(field, dbType)}`;
}

function buildIndexClause(change: IndexDiff, dbType: DatabaseType): string {
  const index = change.index;
  const name = formatSqlIdentifier(index.name, dbType);
  if (change.type === 'remove') {
    return index.kind === 'primary' ? 'DROP PRIMARY KEY' : `DROP INDEX ${name}`;
  }
  const constraint = index.kind === 'primary' || index.kind === 'unique_constraint';
  const columns = index.fields
    .map((field) => {
      const name = formatSqlIdentifier(field.name, dbType);
      return constraint ? name : `${name} ${field.direction}`;
    })
    .join(', ');
  if (index.kind === 'primary') return `ADD PRIMARY KEY (${columns})`;
  if (index.kind === 'unique_constraint') return `ADD CONSTRAINT ${name} UNIQUE (${columns})`;
  return `ADD ${index.kind !== 'index' ? 'UNIQUE ' : ''}INDEX ${name} (${columns})`;
}

export function generateMysqlAlterStatement(
  tableName: string,
  diff: TableDiff,
  dbType: DatabaseType,
): string {
  const clauses = [
    ...diff.indexes
      .filter((change) => change.type === 'remove')
      .map((change) => buildIndexClause(change, dbType)),
    ...diff.fields.map((change) => buildColumnClause(change, dbType)),
    ...diff.indexes
      .filter((change) => change.type === 'add')
      .map((change) => buildIndexClause(change, dbType)),
  ].filter(Boolean);
  if (!clauses.length) return '';
  const prefix = `ALTER TABLE ${formatSqlTableName(tableName, dbType)}`;
  // 自增列必须始终有支持索引；列和索引变更共用一条 ALTER，避免非法中间状态。
  return clauses.length === 1
    ? `${prefix} ${clauses[0]};`
    : `${prefix}\n  ${clauses.join(',\n  ')};`;
}
