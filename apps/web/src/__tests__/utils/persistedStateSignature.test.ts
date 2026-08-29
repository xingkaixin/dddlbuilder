import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  buildPersistedStateSignature,
  buildSchemaStateSignature,
} from '@/utils/persistedStateSignature';

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
  it('keeps large document signatures bounded', () => {
    const signature = buildSchemaStateSignature(createState({ tableComment: 'x'.repeat(100_000) }));
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

    expect(buildSchemaStateSignature(current)).toBe(buildSchemaStateSignature(stored));
  });

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

  it('normalizes omitted editor defaults in full-state signatures', () => {
    const stored = createState();
    const current = createState({
      fieldTableViewConfig: { freezeEnabled: false, freezeColumns: 3 },
    });

    expect(buildPersistedStateSignature(current)).toBe(buildPersistedStateSignature(stored));
  });

  it('keeps schema document changes in the comparison signature', () => {
    const stored = createState();
    const current = createState({ tableComment: 'Changed' });

    expect(buildSchemaStateSignature(current)).not.toBe(buildSchemaStateSignature(stored));
  });
});
