// SQL Preprocessors
export { preprocessOracle } from './OraclePreprocessor.js';
export { preprocessSqlServer } from './SqlServerPreprocessor.js';
export {
  extractStandaloneComments,
  foldUnquotedPostgresIdentifiers,
} from './PostgresPreprocessor.js';

// Types
export type { PreprocessedTableMetadata, PreprocessResult } from './types.js';
