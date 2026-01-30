import type { NormalizedField, DatabaseType } from '@/types';
import type { TableDiff, FieldDiff, IndexDiff } from './tableDiff';
import { TypeMapper } from './TypeMapper';
import {
  getCanonicalBaseType,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  supportsUuidDefault,
  formatConstantDefault,
  escapeSingleQuotes,
  parseFieldType,
} from './databaseTypeMapping';

/**
 * ALTER DDL 生成器
 * 根据 TableDiff 生成各数据库的 ALTER TABLE 语句
 */
export function generateAlterDDL(
  tableName: string,
  diff: TableDiff,
  fields: NormalizedField[],
  dbType: DatabaseType,
): string {
  if (!diff.hasChanges) {
    return '';
  }

  const statements: string[] = [];

  // 表注释变更 (某些数据库支持)
  if (diff.tableCommentChanged) {
    const commentSql = generateTableCommentAlter(
      tableName,
      diff.newTableComment || '',
      dbType,
    );
    if (commentSql) {
      statements.push(commentSql);
    }
  }

  // 1. 处理删除的索引（先删索引，再改字段）
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'remove')) {
    statements.push(generateDropIndex(tableName, idxDiff, dbType));
  }

  // 2. 处理删除的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'remove')) {
    statements.push(generateDropColumn(tableName, fieldDiff, dbType));
  }

  // 3. 处理新增的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'add')) {
    statements.push(
      generateAddColumn(tableName, fieldDiff, dbType),
    );
  }

  // 4. 处理修改的字段
  for (const fieldDiff of diff.fields.filter((f) => f.type === 'modify')) {
    statements.push(
      generateModifyColumn(tableName, fieldDiff, dbType),
    );
  }

  // 5. 处理新增的索引
  for (const idxDiff of diff.indexes.filter((i) => i.type === 'add')) {
    statements.push(generateAddIndex(tableName, idxDiff, dbType));
  }

  return statements.filter((s) => s.trim()).join('\n\n');
}

/**
 * 生成表注释变更语句
 */
function generateTableCommentAlter(
  tableName: string,
  comment: string,
  dbType: DatabaseType,
): string {
  const escapedComment = escapeSingleQuotes(comment);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
      return `ALTER TABLE ${tableName} COMMENT = '${escapedComment}';`;
    case 'postgresql':
    case 'postgresql-citus':
      return `COMMENT ON TABLE ${tableName} IS '${escapedComment}';`;
    case 'sqlserver':
      // SQL Server 使用扩展属性，较复杂，暂返回注释提示
      return `-- 请使用 sp_updateextendedproperty 更新表注释`;
    case 'oracle':
    case 'oceanbase-oracle':
      return `COMMENT ON TABLE ${tableName} IS '${escapedComment}';`;
    case 'dm':
      return `COMMENT ON TABLE ${tableName} IS '${escapedComment}';`;
    default:
      return '';
  }
}

/**
 * 生成删除字段语句
 */
function generateDropColumn(
  tableName: string,
  fieldDiff: FieldDiff,
  dbType: DatabaseType,
): string {
  const fieldName = fieldDiff.fieldName;

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
    case 'postgresql':
    case 'postgresql-citus':
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
    case 'sqlserver':
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
    default:
      return `ALTER TABLE ${tableName} DROP COLUMN ${fieldName};`;
  }
}

/**
 * 生成新增字段语句
 */
function generateAddColumn(
  tableName: string,
  fieldDiff: FieldDiff,
  dbType: DatabaseType,
): string {
  const field = fieldDiff.newField!;
  const columnDef = buildColumnDefinition(field, dbType);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${columnDef};`;
    case 'postgresql':
    case 'postgresql-citus':
      return `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${columnDef};`;
    case 'sqlserver':
      return `ALTER TABLE ${tableName} ADD ${field.name} ${columnDef};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} ADD (${field.name} ${columnDef});`;
    default:
      return `ALTER TABLE ${tableName} ADD COLUMN ${field.name} ${columnDef};`;
  }
}

/**
 * 生成修改字段语句
 */
function generateModifyColumn(
  tableName: string,
  fieldDiff: FieldDiff,
  dbType: DatabaseType,
): string {
  const field = fieldDiff.newField!;
  const columnDef = buildColumnDefinition(field, dbType);

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `ALTER TABLE ${tableName} MODIFY COLUMN ${field.name} ${columnDef};`;
    case 'postgresql':
    case 'postgresql-citus':
      // PostgreSQL 需要分开处理类型、nullable、default
      return generatePostgresModifyColumn(tableName, fieldDiff);
    case 'sqlserver':
      return `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} ${columnDef};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `ALTER TABLE ${tableName} MODIFY (${field.name} ${columnDef});`;
    default:
      return `ALTER TABLE ${tableName} MODIFY COLUMN ${field.name} ${columnDef};`;
  }
}

/**
 * PostgreSQL 特殊的字段修改语句（需要分多条）
 */
function generatePostgresModifyColumn(
  tableName: string,
  fieldDiff: FieldDiff,
): string {
  const field = fieldDiff.newField!;
  const changes = fieldDiff.changes || [];
  const statements: string[] = [];

  if (changes.includes('type')) {
    const typeMapper = TypeMapper.create('postgresql');
    const parsedType = parseFieldType(field.type);
    const mappedType = typeMapper.mapType(parsedType);
    statements.push(
      `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} TYPE ${mappedType};`,
    );
  }

  if (changes.includes('nullable')) {
    if (field.nullable) {
      statements.push(
        `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} DROP NOT NULL;`,
      );
    } else {
      statements.push(
        `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} SET NOT NULL;`,
      );
    }
  }

  if (changes.includes('default')) {
    const defaultClause = buildDefaultClause(field, 'postgresql');
    if (defaultClause) {
      statements.push(
        `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} SET ${defaultClause};`,
      );
    } else {
      statements.push(
        `ALTER TABLE ${tableName} ALTER COLUMN ${field.name} DROP DEFAULT;`,
      );
    }
  }

  if (changes.includes('comment')) {
    const escapedComment = escapeSingleQuotes(field.comment);
    statements.push(
      `COMMENT ON COLUMN ${tableName}.${field.name} IS '${escapedComment}';`,
    );
  }

  return statements.join('\n');
}

/**
 * 生成删除索引语句
 */
function generateDropIndex(
  tableName: string,
  idxDiff: IndexDiff,
  dbType: DatabaseType,
): string {
  const index = idxDiff.index;

  // 主键需要特殊处理
  if (index.isPrimary) {
    switch (dbType) {
      case 'mysql':
      case 'mariadb':
      case 'tidb':
      case 'oceanbase':
        return `ALTER TABLE ${tableName} DROP PRIMARY KEY;`;
      case 'postgresql':
      case 'postgresql-citus':
        return `ALTER TABLE ${tableName} DROP CONSTRAINT ${index.name};`;
      case 'sqlserver':
        return `ALTER TABLE ${tableName} DROP CONSTRAINT ${index.name};`;
      case 'oracle':
      case 'oceanbase-oracle':
      case 'dm':
        return `ALTER TABLE ${tableName} DROP CONSTRAINT ${index.name};`;
      default:
        return `ALTER TABLE ${tableName} DROP PRIMARY KEY;`;
    }
  }

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
    case 'tidb':
    case 'oceanbase':
      return `DROP INDEX ${index.name} ON ${tableName};`;
    case 'postgresql':
    case 'postgresql-citus':
      return `DROP INDEX ${index.name};`;
    case 'sqlserver':
      return `DROP INDEX ${index.name} ON ${tableName};`;
    case 'oracle':
    case 'oceanbase-oracle':
    case 'dm':
      return `DROP INDEX ${index.name};`;
    default:
      return `DROP INDEX ${index.name} ON ${tableName};`;
  }
}

/**
 * 生成新增索引语句
 */
function generateAddIndex(
  tableName: string,
  idxDiff: IndexDiff,
  dbType: DatabaseType,
): string {
  const index = idxDiff.index;
  const fieldList = index.fields.map((f) => `${f.name} ${f.direction}`).join(', ');

  // 主键
  if (index.isPrimary) {
    const pkFields = index.fields.map((f) => f.name).join(', ');
    switch (dbType) {
      case 'mysql':
      case 'mariadb':
      case 'tidb':
      case 'oceanbase':
        return `ALTER TABLE ${tableName} ADD PRIMARY KEY (${pkFields});`;
      case 'postgresql':
      case 'postgresql-citus':
        return `ALTER TABLE ${tableName} ADD CONSTRAINT ${index.name} PRIMARY KEY (${pkFields});`;
      case 'sqlserver':
        return `ALTER TABLE ${tableName} ADD CONSTRAINT ${index.name} PRIMARY KEY (${pkFields});`;
      case 'oracle':
      case 'oceanbase-oracle':
      case 'dm':
        return `ALTER TABLE ${tableName} ADD CONSTRAINT ${index.name} PRIMARY KEY (${pkFields});`;
      default:
        return `ALTER TABLE ${tableName} ADD PRIMARY KEY (${pkFields});`;
    }
  }

  const indexType = index.unique ? 'UNIQUE INDEX' : 'INDEX';
  return `CREATE ${indexType} ${index.name} ON ${tableName} (${fieldList});`;
}

/**
 * 构建字段定义（不含字段名）
 */
function buildColumnDefinition(
  field: NormalizedField,
  dbType: DatabaseType,
): string {
  const typeMapper = TypeMapper.create(dbType);
  const parsedType = parseFieldType(field.type);
  const type = typeMapper.mapType(parsedType);
  const base = getCanonicalBaseType(field.type);

  const parts: string[] = [type];

  // 自增（仅特定数据库和类型支持）
  if (field.defaultKind === 'auto_increment' && supportsAutoIncrement(dbType, base)) {
    if (dbType === 'mysql' || dbType === 'mariadb' || dbType === 'tidb') {
      parts.push('AUTO_INCREMENT');
    }
    // PostgreSQL/Oracle 的自增在类型中处理（SERIAL/IDENTITY）
  }

  // NULL/NOT NULL
  parts.push(field.nullable ? 'NULL' : 'NOT NULL');

  // 默认值
  const defaultClause = buildDefaultClause(field, dbType);
  if (defaultClause) {
    parts.push(defaultClause);
  }

  // ON UPDATE（仅 MySQL 系）
  if (
    field.onUpdate === 'current_timestamp' &&
    supportsOnUpdateCurrentTimestamp(dbType, base)
  ) {
    parts.push('ON UPDATE CURRENT_TIMESTAMP');
  }

  // 注释（仅 MySQL 系内联）
  if (
    field.comment &&
    (dbType === 'mysql' || dbType === 'mariadb' || dbType === 'tidb' || dbType === 'oceanbase')
  ) {
    parts.push(`COMMENT '${escapeSingleQuotes(field.comment)}'`);
  }

  return parts.join(' ');
}

/**
 * 构建默认值子句
 */
function buildDefaultClause(
  field: NormalizedField,
  dbType: DatabaseType,
): string {
  const base = getCanonicalBaseType(field.type);

  if (field.defaultKind === 'constant') {
    return formatConstantDefault(base, field.defaultValue);
  }

  if (field.defaultKind === 'uuid' && supportsUuidDefault(base)) {
    if (dbType === 'mysql' || dbType === 'mariadb' || dbType === 'tidb') {
      return 'DEFAULT (UUID())';
    }
    if (dbType === 'postgresql' || dbType === 'postgresql-citus') {
      return 'DEFAULT gen_random_uuid()';
    }
  }

  if (
    field.defaultKind === 'current_timestamp' &&
    supportsDefaultCurrentTimestamp(dbType, base)
  ) {
    if (dbType === 'sqlserver') {
      return 'DEFAULT GETDATE()';
    }
    return 'DEFAULT CURRENT_TIMESTAMP';
  }

  return '';
}
