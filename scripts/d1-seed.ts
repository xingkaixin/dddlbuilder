import { resolveD1Mode, runD1Execute, seedSqlPath } from './d1-utils';

if (process.argv.slice(2).includes('--remote')) {
  console.error('[d1] seed 灌入本地测试数据，拒绝执行 --remote');
  process.exit(1);
}

console.log('[d1] seeding local database');
runD1Execute('local', { file: seedSqlPath });
