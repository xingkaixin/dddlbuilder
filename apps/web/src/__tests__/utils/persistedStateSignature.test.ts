import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';

const createState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  ...overrides,
});

describe('persistedStateSignature', () => {
  it('keeps large document signatures bounded', () => {
    const signature = serializePersistedStateForComparison(
      createState({ tableComment: 'x'.repeat(100_000) }),
    );
    expect(signature).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  it('treats UI defaults as unchanged table state', () => {
    const stored = createState();
    const current = createState({
      objectType: 'table',
      viewDefinition: '',
      viewCreateOrReplace: true,
      foreignKeys: [],
      mysqlPartitionConfig: {
        enabled: false,
        type: 'RANGE',
        columns: [],
        partitionCount: 4,
        partitions: [],
      },
      tableMiscConfig: {
        enabled: false,
        engine: '',
        charset: '',
        collation: '',
        tablespace: '',
      },
      fieldTableViewConfig: {
        freezeEnabled: false,
        freezeColumns: 3,
      },
    });

    expect(serializePersistedStateForComparison(current)).toBe(
      serializePersistedStateForComparison(stored),
    );
  });

  it('ignores editor session changes when comparing schema documents', () => {
    const stored = createState();
    const current = createState({
      sqlFormatMode: 'aligned',
      addCount: 50,
      indexInput: 'idx_users_email',
      currentIndexFields: [{ name: 'email', direction: 'DESC' }],
      fieldTableViewConfig: {
        freezeEnabled: true,
        freezeColumns: 5,
      },
    });

    expect(serializePersistedStateForComparison(current)).toBe(
      serializePersistedStateForComparison(stored),
    );
  });

  it('keeps schema document changes in the comparison signature', () => {
    const stored = createState();
    const current = createState({ tableComment: 'Changed' });

    expect(serializePersistedStateForComparison(current)).not.toBe(
      serializePersistedStateForComparison(stored),
    );
  });
});
