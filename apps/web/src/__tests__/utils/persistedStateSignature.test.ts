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
});
