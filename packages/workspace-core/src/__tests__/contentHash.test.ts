import { describe, expect, it } from 'vitest';
import { buildWorkspaceContentHash } from '../contentHash';

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
});
