import type {
  IndexDefinition,
  MysqlPartitionConfig,
  NormalizedField,
  TableMiscConfig,
} from '../../types/index.js';

export type ParsedResult = {
  schemaName?: string;
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
