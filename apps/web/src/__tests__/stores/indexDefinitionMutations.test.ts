import { describe, expect, it } from 'vitest';
import type { IndexDefinition } from '@ddlbuilder/shared-types';
import { insertIndexDefinition, replaceIndexDefinition } from '@/stores/indexDefinitionMutations';

const index = (changes: Partial<IndexDefinition> = {}): IndexDefinition => ({
  id: 'index-1',
  name: 'idx_users_id',
  fields: [{ name: 'id', direction: 'ASC' }],
  kind: 'index',
  ...changes,
});

describe('index definition mutations', () => {
  it('rejects duplicate names without case sensitivity', () => {
    expect(
      insertIndexDefinition([index()], index({ id: 'index-2', name: 'IDX_USERS_ID' })),
    ).toEqual({ ok: false, reason: 'duplicate-name' });
  });

  it('rejects a second primary index', () => {
    expect(
      insertIndexDefinition(
        [index({ kind: 'primary' })],
        index({ id: 'index-2', name: 'pk_users_2', kind: 'primary' }),
      ),
    ).toEqual({ ok: false, reason: 'primary-exists' });
  });

  it('replaces an existing index without changing its position', () => {
    const existing = [index(), index({ id: 'index-2', name: 'idx_users_email' })];
    const replacement = index({ name: 'idx_users_account_id' });

    expect(replaceIndexDefinition(existing, replacement)).toEqual({
      ok: true,
      indexes: [replacement, existing[1]],
    });
  });

  it('rejects replacing a removed index', () => {
    expect(replaceIndexDefinition([], index())).toEqual({ ok: false, reason: 'not-found' });
  });
});
