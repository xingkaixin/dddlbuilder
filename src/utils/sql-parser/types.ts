import type {
  IndexDefinition,
  MysqlPartitionConfig,
  NormalizedField,
  TableMiscConfig,
} from '../types.js';

export type ParsedResult = {
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes: IndexDefinition[];
  authObjects: string[];
  tableMiscConfig?: TableMiscConfig;
  mysqlPartitionConfig?: MysqlPartitionConfig;
};

export type ParserInstance = {
  astify: (sql: string, opt: { database: string }) => any;
};

export type ParserConstructor = new () => ParserInstance;
export type ParserModule = {
  Parser?: unknown;
  default?: unknown;
};
