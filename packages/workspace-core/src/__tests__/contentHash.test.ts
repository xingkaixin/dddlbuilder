import { describe, expect, it } from 'vitest';
import { buildWorkspaceContentHash } from '../contentHash';
import { stableStringify } from '../stableStringify';

describe('buildWorkspaceContentHash', () => {
  it('produces the same hash regardless of object key order', async () => {
    await expect(buildWorkspaceContentHash({ table: 'users', version: 1 })).resolves.toBe(
      await buildWorkspaceContentHash({ version: 1, table: 'users' }),
    );
  });

  it('treats undefined properties as missing properties', async () => {
    await expect(buildWorkspaceContentHash({ value: undefined })).resolves.toBe(
      await buildWorkspaceContentHash({}),
    );
  });

  it('keeps undefined array elements distinguishable', async () => {
    await expect(buildWorkspaceContentHash([undefined, 1])).resolves.not.toBe(
      await buildWorkspaceContentHash([1]),
    );
  });

  it('serializes every supported canonical value', async () => {
    const values = [
      null,
      'value',
      1,
      true,
      1n,
      Symbol('value'),
      Symbol(),
      () => undefined,
      [1, undefined],
    ];

    const hashes = await Promise.all(values.map((value) => buildWorkspaceContentHash(value)));

    expect(new Set(hashes).size).toBe(values.length);
  });

  it('exposes the same canonical serialization used by content hashes', () => {
    expect(stableStringify(undefined)).toBe('undefined');
    expect(stableStringify([undefined, 1n])).toBe('[undefined,bigint:1]');
    expect(stableStringify({ b: 1, a: 2, omitted: undefined })).toBe('{"a":2,"b":1}');
  });
});
