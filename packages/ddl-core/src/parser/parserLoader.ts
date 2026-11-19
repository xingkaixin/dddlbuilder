import type { SqlParserDialect } from '../utils/databaseFamily.js';
import type { ParserConstructor, ParserModule } from './types.js';

const parserConstructorPromises = new Map<SqlParserDialect, Promise<ParserConstructor>>();

const importDialectModule = (dialect: SqlParserDialect): Promise<ParserModule> => {
  switch (dialect) {
    case 'mysql':
      return import('node-sql-parser/build/mysql.js');
    case 'mariadb':
      return import('node-sql-parser/build/mariadb.js');
    case 'postgresql':
      return import('node-sql-parser/build/postgresql.js');
    case 'transactsql':
      return import('node-sql-parser/build/transactsql.js');
    case 'hive':
      return import('node-sql-parser/build/hive.js');
  }
};

// node-sql-parser exposes CommonJS and ESM module shapes; runtime checks are the interop boundary.
// oxlint-disable anti-slop/no-runtime-typeof
const normalizeParserConstructor = (module: ParserModule) => {
  const parserFromNamed = module.Parser;

  if (typeof parserFromNamed === 'function') {
    // SAFETY: the runtime function is the named node-sql-parser Parser constructor.
    return parserFromNamed as ParserConstructor;
  }

  if (module.default && typeof module.default === 'object' && 'Parser' in module.default) {
    // SAFETY: the object branch proves the default export has the Parser property before reading it.
    const parserFromDefaultObject = (module.default as { Parser?: unknown }).Parser;

    if (typeof parserFromDefaultObject === 'function') {
      // SAFETY: the runtime function is the Parser constructor exposed by the default module object.
      return parserFromDefaultObject as ParserConstructor;
    }
  }

  if (typeof module.default === 'function') {
    // SAFETY: the runtime function is the default node-sql-parser Parser constructor.
    return module.default as ParserConstructor;
  }

  throw new Error('node-sql-parser 模块加载失败：Parser 构造器不可用');
};
// oxlint-enable anti-slop/no-runtime-typeof

export const loadParserConstructor = (dialect: SqlParserDialect): Promise<ParserConstructor> => {
  const existing = parserConstructorPromises.get(dialect);

  if (existing) return existing;

  const loaded = importDialectModule(dialect).then((module) => normalizeParserConstructor(module));
  parserConstructorPromises.set(dialect, loaded);

  return loaded;
};
