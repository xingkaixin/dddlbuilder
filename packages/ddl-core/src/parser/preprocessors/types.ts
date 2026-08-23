/**
 * Common types for SQL preprocessors
 */

/**
 * Result from preprocessing SQL before parsing
 */
export type PreprocessedTableMetadata = {
  tableName: string;
  tableComment: string;
  columnComments: Record<string, string>;
};

export type PreprocessResult = {
  /** Normalized SQL ready for parsing */
  sql: string;
  /** Extracted comments grouped by their owning table */
  tableMetadata: PreprocessedTableMetadata[];
};
