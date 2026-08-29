import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildPersistedStateSignature, buildSchemaStateSignature } from '../schemaStateSignature';

const createState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
  ...overrides,
});

describe('schemaStateSignature', () => {
  it('separates schema equality from full persisted-state equality', () => {
    const stored = createState();
    const current = createState({ sqlFormatMode: 'aligned', addCount: 25 });

    expect(buildSchemaStateSignature(current)).toBe(buildSchemaStateSignature(stored));
    expect(buildPersistedStateSignature(current)).not.toBe(buildPersistedStateSignature(stored));
  });

  it('normalizes implicit editor defaults', () => {
    const stored = createState();
    const current = createState({
      fieldTableViewConfig: { freezeEnabled: false, freezeColumns: 3 },
    });

    expect(buildPersistedStateSignature(current)).toBe(buildPersistedStateSignature(stored));
  });
});
