import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  buildPersistedStateSignature,
  buildSchemaStateSignature,
} from '@ddlbuilder/workspace-core';

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

describe('persistedStateSignature', () => {
  it('ignores editor session changes when comparing schema documents', () => {
    const stored = createState();

    const current = createState({
      sqlFormatMode: 'aligned',
      addCount: 50,
      fieldTableViewConfig: {
        freezeEnabled: true,
        freezeColumns: 5,
      },
    });

    expect(buildSchemaStateSignature(current)).toBe(buildSchemaStateSignature(stored));
    expect(buildPersistedStateSignature(current)).not.toBe(buildPersistedStateSignature(stored));
  });

  it('keeps schema document changes in the comparison signature', () => {
    const stored = createState();
    const current = createState({ tableComment: 'Changed' });

    expect(buildSchemaStateSignature(current)).not.toBe(buildSchemaStateSignature(stored));
  });
});
