import type {
  DatabaseType,
  ForeignKeyAction,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import { getDatabaseFamily, type DatabaseFamily } from './databaseFamily';
import { buildQualifiedTableName, formatSqlTableName } from './databaseTypeMapping';
import { formatSqlIdentifier } from './sqlIdentifiers';

type ForeignKeyEvent = 'onDelete' | 'onUpdate';
const mysqlActions: readonly ForeignKeyAction[] = ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'];
const standardActions: readonly ForeignKeyAction[] = [
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
  'NO ACTION',
];
const postgresActions: readonly ForeignKeyAction[] = [...standardActions, 'RESTRICT'];
const actions: Record<DatabaseFamily, Record<ForeignKeyEvent, readonly ForeignKeyAction[]>> = {
  mysql: { onDelete: mysqlActions, onUpdate: mysqlActions },
  postgresql: { onDelete: postgresActions, onUpdate: postgresActions },
  sqlserver: { onDelete: standardActions, onUpdate: standardActions },
  dm: { onDelete: standardActions, onUpdate: standardActions },
  oracle: { onDelete: ['CASCADE', 'SET NULL'], onUpdate: [] },
  hive: { onDelete: [], onUpdate: [] },
};

export const getForeignKeyActions = (
  dbType: DatabaseType,
  event: ForeignKeyEvent,
): readonly ForeignKeyAction[] => {
  const family = getDatabaseFamily(dbType);
  return family ? actions[family][event] : [];
};

export const getForeignKeyIssue = (
  fk: Pick<ForeignKeyDefinition, ForeignKeyEvent>,
  dbType: DatabaseType,
): string | null => {
  const family = getDatabaseFamily(dbType);
  if (!family || family === 'hive') return `Foreign keys are not supported by ${dbType}`;
  for (const event of ['onDelete', 'onUpdate'] as const) {
    const action = fk[event];
    if (action && !getForeignKeyActions(dbType, event).includes(action)) {
      return `${dbType} does not support ON ${event === 'onDelete' ? 'DELETE' : 'UPDATE'} ${action}`;
    }
  }
  return null;
};

export const buildForeignKeyDDL = (
  tableName: string,
  fk: ForeignKeyDefinition,
  dbType: DatabaseType,
): string => {
  const table = formatSqlTableName(tableName, dbType);
  const constraint = formatSqlIdentifier(fk.name, dbType);
  const issue = getForeignKeyIssue(fk, dbType);
  if (issue)
    return `-- Manual migration required: foreign key ${constraint} on ${table}. ${issue}.`;
  const fields = fk.fields.map((name) => formatSqlIdentifier(name, dbType)).join(', ');
  const refFields = fk.refFields.map((name) => formatSqlIdentifier(name, dbType)).join(', ');
  const refTable = buildQualifiedTableName(fk.refSchema ?? '', fk.refTable, dbType);
  const onDelete = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
  const onUpdate = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '';
  return `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (${fields}) REFERENCES ${refTable} (${refFields})${onDelete}${onUpdate};`;
};
