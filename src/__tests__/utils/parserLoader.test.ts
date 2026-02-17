import { afterEach, describe, expect, it, vi } from 'vitest';

describe('parserLoader', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('node-sql-parser');
  });

  it('应优先使用命名导出 Parser', async () => {
    class NamedParser {
      astify() {
        return {};
      }
    }

    vi.doMock('node-sql-parser', () => ({
      Parser: NamedParser,
    }));

    const { loadParserConstructor } = await import(
      '@/utils/sql-parser/parserLoader'
    );
    await expect(loadParserConstructor()).resolves.toBe(NamedParser);
  });

  it('应支持 default 对象中的 Parser', async () => {
    class DefaultObjectParser {
      astify() {
        return {};
      }
    }

    vi.doMock('node-sql-parser', () => ({
      Parser: undefined,
      default: {
        Parser: DefaultObjectParser,
      },
    }));

    const { loadParserConstructor } = await import(
      '@/utils/sql-parser/parserLoader'
    );
    await expect(loadParserConstructor()).resolves.toBe(DefaultObjectParser);
  });

  it('应支持 default 直接导出构造器', async () => {
    class DefaultParser {
      astify() {
        return {};
      }
    }

    vi.doMock('node-sql-parser', () => ({
      Parser: undefined,
      default: DefaultParser,
    }));

    const { loadParserConstructor } = await import(
      '@/utils/sql-parser/parserLoader'
    );
    await expect(loadParserConstructor()).resolves.toBe(DefaultParser);
  });

  it('无可用构造器时应抛出错误', async () => {
    vi.doMock('node-sql-parser', () => ({
      Parser: undefined,
      default: {},
    }));

    const { loadParserConstructor } = await import(
      '@/utils/sql-parser/parserLoader'
    );
    await expect(loadParserConstructor()).rejects.toThrow(
      'node-sql-parser 模块加载失败：Parser 构造器不可用',
    );
  });

  it('应缓存加载结果并复用同一构造器', async () => {
    let loadCount = 0;
    class CachedParser {
      astify() {
        return {};
      }
    }

    vi.doMock('node-sql-parser', () => {
      loadCount += 1;
      return {
        Parser: CachedParser,
      };
    });

    const { loadParserConstructor } = await import(
      '@/utils/sql-parser/parserLoader'
    );
    const [first, second] = await Promise.all([
      loadParserConstructor(),
      loadParserConstructor(),
    ]);

    expect(first).toBe(CachedParser);
    expect(second).toBe(CachedParser);
    expect(loadCount).toBe(1);
  });
});
