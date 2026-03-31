import { describe, expect, it, vi } from 'vitest';
import {
  buildShareStorageKey,
  fireAndForget,
  parseSharePath,
  readStorageJson,
  removeStorage,
  writeStorageJson,
} from '@/hooks/workspacePersistence/storage';
import { STORAGE_KEY } from '@/utils/constants';

describe('workspacePersistence/storage', () => {
  it('writeStorageJson 应写入 JSON 字符串', () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    writeStorageJson('k1', { a: 1 });
    expect(setItemSpy).toHaveBeenCalledWith('k1', JSON.stringify({ a: 1 }));
  });

  it('writeStorageJson 在 localStorage 异常时应静默', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(() => writeStorageJson('k1', { a: 1 })).not.toThrow();
  });

  it('readStorageJson 应读取并解析 JSON', () => {
    vi.spyOn(window.localStorage, 'getItem').mockReturnValue(JSON.stringify({ a: 1 }));

    expect(readStorageJson<{ a: number }>('k1')).toEqual({ a: 1 });
  });

  it('readStorageJson 在空值或解析失败时应返回 null', () => {
    vi.spyOn(window.localStorage, 'getItem').mockReturnValueOnce(null);
    expect(readStorageJson('k1')).toBeNull();

    vi.spyOn(window.localStorage, 'getItem').mockReturnValueOnce('{invalid');
    expect(readStorageJson('k1')).toBeNull();
  });

  it('removeStorage 在异常时应静默', () => {
    const removeSpy = vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('failed');
    });

    expect(() => removeStorage('k1')).not.toThrow();
    expect(removeSpy).toHaveBeenCalledWith('k1');
  });

  it('fireAndForget 应吞掉 rejection', async () => {
    fireAndForget(Promise.reject(new Error('x')));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(true).toBe(true);
  });

  it('buildShareStorageKey 应生成固定前缀 key', () => {
    expect(buildShareStorageKey('abc')).toBe(`${STORAGE_KEY}:share:abc`);
  });

  it('parseSharePath 应解析合法分享路径并识别非法路径', () => {
    const valid = parseSharePath('/share/8c6afce1-2a39-47aa-a14f-f3450c3ad7dd');
    expect(valid).toEqual({
      shareId: '8c6afce1-2a39-47aa-a14f-f3450c3ad7dd',
      invalid: false,
    });

    expect(parseSharePath('/share/not-uuid')).toEqual({
      shareId: null,
      invalid: true,
    });

    expect(parseSharePath('/home')).toEqual({
      shareId: null,
      invalid: false,
    });
  });
});
