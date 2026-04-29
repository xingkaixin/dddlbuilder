import { resolveD1Mode, runPendingMigrations } from './d1-utils';

runPendingMigrations(resolveD1Mode(process.argv.slice(2)));
