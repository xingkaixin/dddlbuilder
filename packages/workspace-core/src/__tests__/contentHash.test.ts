import { describe, expect, it } from 'vitest';
import { buildWorkspaceContentHash } from '../contentHash';

describe('buildWorkspaceContentHash', () => {
  it('produces the same hash regardless of object key order', async () => {
    await expect(buildWorkspaceContentHash({ table: 'users', version: 1 })).resolves.toBe(
      await buildWorkspaceContentHash({ version: 1, table: 'users' }),
    );
  });

  it('distinguishes undefined properties from missing properties', async () => {
    await expect(buildWorkspaceContentHash({ value: undefined })).resolves.not.toBe(
      await buildWorkspaceContentHash({}),
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
});
