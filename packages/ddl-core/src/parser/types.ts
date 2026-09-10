import type { ParsedResultSchema } from '@ddlbuilder/shared-types/api-contracts';
import type { AstStatement } from './astTypes.js';

/** Identifier fields retain their SQL delimiter spelling when identity depends on it. */
export type ParsedResult = {
  -readonly [K in keyof typeof ParsedResultSchema.Type]: (typeof ParsedResultSchema.Type)[K];
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
