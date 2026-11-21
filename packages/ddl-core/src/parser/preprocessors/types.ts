export type PreprocessedTableMetadata = {
  tableName: string;
  tableComment: string;
  columnComments: Record<string, string>;
};

export type PreprocessResult = {
  sql: string;
  tableMetadata: PreprocessedTableMetadata[];
  identifierMappings?: ReadonlyMap<string, string>;
};
