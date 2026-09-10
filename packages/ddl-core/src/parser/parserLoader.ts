import type { ParserConstructor, ParserModule } from './types.js';

let parserConstructorPromise: Promise<ParserConstructor> | null = null;
const defaultParserModuleLoader = () => import('node-sql-parser');
let parserModuleLoader: () => Promise<ParserModule> = defaultParserModuleLoader;

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

export const loadParserConstructor = (): Promise<ParserConstructor> => {
  if (!parserConstructorPromise) {
    parserConstructorPromise = parserModuleLoader().then((module) =>
      normalizeParserConstructor(module),
    );
  }

  return parserConstructorPromise;
};

// Test-only loader override to avoid brittle mocking around dynamic imports.
export const __setParserModuleLoaderForTests = (loader: (() => Promise<ParserModule>) | null) => {
  parserModuleLoader = loader ?? defaultParserModuleLoader;
  parserConstructorPromise = null;
};
