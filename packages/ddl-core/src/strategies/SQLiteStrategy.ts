import type {
  NormalizedField,
  IndexDefinition,
  TableMiscConfig,
  SqlFormatMode,
} from '@ddlbuilder/shared-types';
import { AbstractDDLStrategy } from './AbstractDDLStrategy';
import { buildSqliteTable } from '../utils/sqliteSchema';

export class SQLiteStrategy extends AbstractDDLStrategy {
  getDatabaseType() {
    return 'sqlite' as const;
  }
  generateTableDDL(
    tableName: string,
    tableComment: string,
    fields: NormalizedField[],
    tableMiscConfig?: TableMiscConfig,
    _format?: SqlFormatMode,
    indexes: IndexDefinition[] = [],
  ) {
    return buildSqliteTable({
      dbType: 'sqlite',
      tableName,
      tableComment,
      fields,
      tableMiscConfig,
      indexes,
    });
  }
}
