import type { IndexDefinition, NormalizedField } from '../types';

export type ParsedResult = {
  tableName: string;
  tableComment: string;
  fields: NormalizedField[];
  indexes: IndexDefinition[];
  authObjects: string[];
};

export type ParserInstance = {
  astify: (sql: string, opt: { database: string }) => any;
};

export type ParserConstructor = new () => ParserInstance;
export type ParserModule = {
  Parser?: unknown;
  default?: unknown;
};
