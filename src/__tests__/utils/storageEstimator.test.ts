import { describe, it, expect } from 'vitest';
import { estimateStorage } from '@/utils/storageEstimator';
import type { NormalizedField } from '@/types';

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

  it('should handle TiDB replication factor', () => {
    const result = estimateStorage('tidb', fields);
    expect(result.dbName).toBe('TiDB (TiKV)');
    const baseData = 8 + 50 + 8;
    expect(result.dataSize).toBe(baseData * 3);
  });

  it('should handle OceanBase compression factor', () => {
    const result = estimateStorage('oceanbase', fields);
    expect(result.dbName).toBe('OceanBase');
    const baseData = 8 + 50 + 8;
    expect(result.dataSize).toBe(Math.ceil(baseData * 0.3));
  });

  it('should handle Oracle and Dameng storage profiles', () => {
    const oracleResult = estimateStorage('oracle', fields);
    const dmResult = estimateStorage('dm', fields);
    expect(oracleResult.dbName).toBe('Oracle');
    expect(dmResult.dbName).toBe('Oracle'); // DM uses Oracle profile
    expect(oracleResult.rowOverhead).toBe(3 + fields.length);
  });

  it('should handle SQL Server storage profile', () => {
    const result = estimateStorage('sqlserver', fields);
    expect(result.dbName).toBe('SQL Server');
    expect(result.rowOverhead).toBe(4 + 2 + 1); // Row header + Null bitmap header + Null bitmap
  });

  it('should handle various data types in getFieldSize', () => {
    const testFields: NormalizedField[] = [
      {
        name: 'f1',
        type: 'tinyint',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f2',
        type: 'smallint',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f3',
        type: 'double',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f4',
        type: 'nchar(20)',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f5',
        type: 'text',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f6',
        type: 'boolean',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const mysqlResult = estimateStorage('mysql', testFields);
    // f1(1) + f2(2) + f3(8) + f4(20*2=40) + f5(20) + f6(1) = 72
    expect(mysqlResult.dataSize).toBe(72);

    const pgResult = estimateStorage('postgresql', testFields);
    // f5(24 for PG) -> dataSize should reflect that
    expect(pgResult.dataSize).toBeGreaterThan(mysqlResult.dataSize);

    const otherResult = estimateStorage('oracle', [
      {
        name: 'f1',
        type: 'text',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ]);
    expect(otherResult.dataSize).toBe(32); // Default for LOB in other DBs

    const unknownResult = estimateStorage('mysql', [
      {
        name: 'f1',
        type: 'unknown_type',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ]);
    expect(unknownResult.dataSize).toBe(8); // Default fallback
  });
});
