import { resolveD1Mode, runAllMigrations } from './d1-utils';

runAllMigrations(resolveD1Mode(process.argv.slice(2)));
