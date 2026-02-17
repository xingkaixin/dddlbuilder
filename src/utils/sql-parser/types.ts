import type {
  IndexDefinition,
  NormalizedField,
  TableMiscConfig,
} from '../types';

export type ParsedResult = {
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes: IndexDefinition[];
  authObjects: string[];
  tableMiscConfig?: TableMiscConfig;
};

export type ParserInstance = {
  astify: (sql: string, opt: { database: string }) => any;
};

export type ParserConstructor = new () => ParserInstance;
export type ParserModule = {
  Parser?: unknown;
  default?: unknown;
};
