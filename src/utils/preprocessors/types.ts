/**
 * Common types for SQL preprocessors
 */

/**
 * Result from preprocessing SQL before parsing
 */
export type PreprocessResult = {
  /** Normalized SQL ready for parsing */
  sql: string;
  /** Extracted table comment */
  tableComment: string;
  /** Map of column name to comment */
  columnComments: Record<string, string>;
};
