import type { ParserConstructor, ParserModule } from './types.js';

let parserConstructorPromise: Promise<ParserConstructor> | null = null;
const defaultParserModuleLoader = () => import('node-sql-parser');
let parserModuleLoader: () => Promise<ParserModule> = defaultParserModuleLoader;

const normalizeParserConstructor = (module: ParserModule) => {
  const parserFromNamed = module.Parser;
  if (typeof parserFromNamed === 'function') {
    return parserFromNamed as ParserConstructor;
  }

  if (
    module.default &&
    typeof module.default === 'object' &&
    'Parser' in module.default
  ) {
    const parserFromDefaultObject = (module.default as { Parser?: unknown })
      .Parser;
    if (typeof parserFromDefaultObject === 'function') {
      return parserFromDefaultObject as ParserConstructor;
    }
  }

  if (typeof module.default === 'function') {
    return module.default as ParserConstructor;
  }

  throw new Error('node-sql-parser 模块加载失败：Parser 构造器不可用');
};

export const loadParserConstructor = (): Promise<ParserConstructor> => {
  if (!parserConstructorPromise) {
    parserConstructorPromise = parserModuleLoader().then((module) =>
      normalizeParserConstructor(module),
    );
  }
  return parserConstructorPromise;
};

// Test-only reset hook for environments where module cache survives vi.resetModules().
export const __resetParserConstructorPromiseForTests = () => {
  parserConstructorPromise = null;
};

// Test-only loader override to avoid brittle mocking around dynamic imports.
export const __setParserModuleLoaderForTests = (
  loader: (() => Promise<ParserModule>) | null,
) => {
  parserModuleLoader = loader ?? defaultParserModuleLoader;
  parserConstructorPromise = null;
};
