import { resolveD1Mode, runD1Execute, seedSqlPath } from './d1-utils';

const mode = resolveD1Mode(process.argv.slice(2));
console.log(`[d1] seeding ${mode}`);
runD1Execute(mode, { file: seedSqlPath });
