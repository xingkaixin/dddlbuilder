import type {
  IndexDefinition,
  MysqlPartitionConfig,
  NormalizedField,
  TableMiscConfig,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type { AstStatement } from './astTypes.js';

export type ParsedResult = {
  schemaName?: string;
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyDefinition[];
  authObjects: string[];
  tableMiscConfig?: TableMiscConfig;
  mysqlPartitionConfig?: MysqlPartitionConfig;
};

export type ParserInstance = {
  astify: (sql: string, opt: { database: string }) => AstStatement | AstStatement[];
  exprToSQL: (expression: unknown, opt: { database: string }) => string;
};

export type ParserConstructor = new () => ParserInstance;
export type MultiParsedResult = {
  results: ParsedResult[];
  failed: Array<{ statement: string; error: string }>;
};

export type ParserModule = {
  Parser?: unknown;
  default?: unknown;
};
