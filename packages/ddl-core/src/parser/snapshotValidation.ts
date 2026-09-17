import {
  isAlterTableStmt,
  isCreateIndexStmt,
  isCreateTableStmt,
  readField,
  type AstStatement,
  type ColumnListNode,
  type ForeignKeyNode,
} from './astTypes.js';
import { SqlParseError } from './SqlParseError.js';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import { quoteIdentifier } from '../utils/databaseFamily.js';
import { unquoteSqlIdentifier } from '../utils/sqlIdentifiers.js';

function validateIndexColumns(columns: ColumnListNode[] = []): void {
  for (const column of columns) {
    if (readField(column, 'type') !== 'column_ref')
      throw SqlParseError.unsupported('expression index');

    for (const key of ['suffix', 'collate', 'opclass', 'nulls']) {
      if (readField(column, key)) throw SqlParseError.unsupported(`index column ${key}`);
    }
  }
}

function validateReference(definition: ForeignKeyNode): void {
  const reference = definition.reference_definition;

  if (!reference) return;

  if (readField(reference, 'match')) throw SqlParseError.unsupported('foreign key MATCH');
  validateIndexColumns(reference.definition);
}

export function validateSnapshotStatement(statement: AstStatement, dbType: DatabaseType): void {
  if (isCreateTableStmt(statement)) {
    for (const key of [
      'like',
      'as',
      'query_expr',
      'partition_by',
      'inherits',
      'on_commit',
      'temporary',
      'unlogged',
    ]) {
      if (readField(statement, key)) throw SqlParseError.unsupported(`CREATE TABLE ${key}`);
    }

    if (!statement.create_definitions?.length)
      throw SqlParseError.unsupported('CREATE TABLE without column definitions');

    for (const definition of statement.create_definitions) {
      if (definition.resource === 'column' && readField(definition, 'reference_definition'))
        throw SqlParseError.unsupported('inline REFERENCES; use a named table-level FOREIGN KEY');

      if (definition.resource !== 'column') {
        validateIndexColumns(definition.definition);

        for (const key of ['index_options', 'using', 'index_using']) {
          if (readField(definition, key)) throw SqlParseError.unsupported(`index ${key}`);
        }

        if (definition.resource === 'constraint') validateReference(definition);
      }

      if (
        definition.resource === 'column' &&
        definition.unique &&
        !definition.constraint?.constraint
      )
        throw SqlParseError.unsupported(
          'unnamed UNIQUE constraint; provide CONSTRAINT name UNIQUE (...)',
        );

      if (
        definition.resource === 'constraint' &&
        definition.constraint_type !== 'primary key' &&
        !definition.constraint &&
        !definition.index
      )
        throw SqlParseError.unsupported('unnamed constraint; provide the database constraint name');

      const unnamedPrimary =
        definition.resource === 'column'
          ? definition.primary_key && !definition.constraint?.constraint
          : definition.resource === 'constraint' &&
            definition.constraint_type === 'primary key' &&
            !definition.constraint &&
            !definition.index;

      if (dbType === 'postgresql' && unnamedPrimary) {
        const tableName = unquoteSqlIdentifier(statement.table?.[0]?.table ?? '');

        if (encodeURIComponent(tableName).replace(/%[A-F\d]{2}/g, 'x').length > 58)
          throw SqlParseError.unsupported(
            'unnamed primary key on a long table name; provide its database constraint name',
          );
        const name = quoteIdentifier(`${tableName}_pkey`, dbType);

        if (definition.resource === 'column') definition.constraint = { constraint: name };

        if (definition.resource === 'constraint') definition.constraint = name;
      }

      if (
        definition.resource === 'constraint' &&
        !['primary key', 'unique', 'unique key', 'foreign key'].includes(
          definition.constraint_type?.toLowerCase() ?? '',
        )
      ) {
        throw SqlParseError.unsupported(definition.constraint_type || 'table constraint');
      }

      if (
        definition.resource === 'index' &&
        definition.index_type &&
        !['unique', 'normal'].includes(definition.index_type.toLowerCase())
      )
        throw SqlParseError.unsupported(definition.index_type);
    }

    for (const option of statement.table_options ?? []) {
      if (
        ![
          'comment',
          'engine',
          'default charset',
          'charset',
          'collate',
          'collation',
          'tablespace',
        ].includes(option.keyword?.toLowerCase().trim() ?? '')
      )
        throw SqlParseError.unsupported(option.keyword || 'table option');
    }

    return;
  }

  if (isCreateIndexStmt(statement)) {
    validateIndexColumns(statement.index_columns ?? statement.columns ?? []);

    for (const key of ['where', 'include', 'with', 'using', 'index_using']) {
      const value = readField(statement, key);

      if (value && value !== 'btree' && value !== 'BTREE')
        throw SqlParseError.unsupported(`CREATE INDEX ${key}`);
    }

    return;
  }

  if (isAlterTableStmt(statement)) {
    if (!statement.expr?.length) throw SqlParseError.unsupported('ALTER TABLE');

    for (const expression of statement.expr) {
      const definition = expression.create_definitions ?? expression;
      validateIndexColumns(definition.definition);
      validateReference(definition);

      if (!definition.constraint && !readField(definition, 'index'))
        throw SqlParseError.unsupported(
          'unnamed ALTER TABLE constraint; provide its database constraint name',
        );

      if (
        expression.action !== 'add' ||
        !['primary key', 'unique', 'unique key', 'foreign key'].includes(
          definition.constraint_type?.toLowerCase() ?? '',
        )
      )
        throw SqlParseError.unsupported(
          'ALTER TABLE (only ADD PRIMARY KEY / UNIQUE / FOREIGN KEY is supported)',
        );
    }

    return;
  }

  throw SqlParseError.unsupported(
    `${statement.type ?? ''} ${statement.keyword ?? ''}`.trim() || 'SQL statement',
  );
}
