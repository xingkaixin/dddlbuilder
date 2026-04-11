import { resolveD1Mode, runD1Execute } from './d1-utils';

const mode = resolveD1Mode(process.argv.slice(2));

runD1Execute(mode, {
  command: `
    SELECT
      name,
      type
    FROM sqlite_master
    WHERE type IN ('table', 'index')
      AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name;
  `,
});
