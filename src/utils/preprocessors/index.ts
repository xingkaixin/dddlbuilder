// SQL Preprocessors
export { preprocessOracle } from './OraclePreprocessor';
export {
  preprocessSqlServer,
  extractSqlServerGrantUsers,
} from './SqlServerPreprocessor';
export { extractStandaloneComments } from './PostgresPreprocessor';

// Types
export type { PreprocessResult } from './types';
