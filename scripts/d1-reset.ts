import { resetSqlPath, runAllMigrations, runD1Execute, seedSqlPath } from './d1-utils';

if (process.argv.slice(2).includes('--remote')) {
  console.error('[d1] reset 只允许本地数据库，拒绝执行 --remote');
  process.exit(1);
}

console.log('[d1] resetting local database');
runD1Execute('local', { file: resetSqlPath });
runAllMigrations('local');
runD1Execute('local', { file: seedSqlPath });
