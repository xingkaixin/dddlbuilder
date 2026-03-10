// SQL Preprocessors
export { preprocessOracle } from './OraclePreprocessor.js';
export {
  preprocessSqlServer,
  extractSqlServerGrantUsers,
} from './SqlServerPreprocessor.js';
export { extractStandaloneComments } from './PostgresPreprocessor.js';

// Types
export type { PreprocessResult } from './types.js';
