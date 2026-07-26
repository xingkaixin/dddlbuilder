import { baselineExistingMigrations, resolveD1Mode } from './d1-utils';

const args = process.argv.slice(2);
const throughIndex = args.indexOf('--through');
const throughName = throughIndex >= 0 ? args[throughIndex + 1] : undefined;
if (!throughName) {
  throw new Error('用法：--through <migration.sql>');
}

baselineExistingMigrations(resolveD1Mode(args), throughName);
