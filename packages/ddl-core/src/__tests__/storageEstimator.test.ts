import { describe, it, expect } from 'vitest';
import type { NormalizedField } from '@ddlbuilder/shared-types';
import { estimateStorage } from '../utils/storageEstimator';

describe('storageEstimator', () => {
  const fields: NormalizedField[] = [
    {
      name: 'id',
      type: 'bigint',
      nullable: false,
      comment: '',
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      name: 'name',
      type: 'varchar(100)',
      nullable: true,
      comment: '',
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      name: 'created_at',
      type: 'datetime',
      nullable: false,
      comment: '',
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ];

  it('should calculate MySQL storage overhead correctly', () => {
    const result = estimateStorage('mysql', fields);
    expect(result.dbName).toBe('MySQL (InnoDB)');
    expect(result.rowOverhead).toBe(5 + 6 + 7 + 1); // Header + TRX_ID + ROLL_PTR + Null Bitmap (1 byte for 1 nullable field)
    expect(result.totalRowSize).toBeGreaterThan(0);
  });

  it('should calculate PostgreSQL storage with alignment padding', () => {
    const result = estimateStorage('postgresql', fields);
    expect(result.dbName).toBe('PostgreSQL');
    expect(result.rowOverhead).toBe(23 + 4);
    // Data part for id(8) + name(100*0.5=50) + created_at(8) = 66
    // Padding to 8-byte boundary: 66 -> 72
    expect(result.dataSize).toBe(72);
  });
});
