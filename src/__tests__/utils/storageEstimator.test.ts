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

  it('should support kingbase and gaussdb postgres-like profiles', () => {
    const kingbaseResult = estimateStorage('kingbase', fields);
    const gaussdbResult = estimateStorage('gaussdb', fields);

    expect(kingbaseResult.dbName).toBe('Kingbase (人大金仓)');
    expect(gaussdbResult.dbName).toBe('GaussDB (华为)');
    expect(kingbaseResult.rowOverhead).toBe(23 + 4);
    expect(gaussdbResult.rowOverhead).toBe(23 + 4);
    expect(kingbaseResult.dataSize).toBe(72);
    expect(gaussdbResult.dataSize).toBe(72);
  });

  it('should support gbase and polardb mysql-like profiles', () => {
    const gbaseResult = estimateStorage('gbase', fields);
    const polardbResult = estimateStorage('polardb', fields);

    expect(gbaseResult.dbName).toBe('GBase (南大通用)');
    expect(polardbResult.dbName).toBe('PolarDB (阿里云)');
    expect(gbaseResult.rowOverhead).toBe(5 + 6 + 7 + 1);
    expect(polardbResult.rowOverhead).toBe(5 + 6 + 7 + 1);
    expect(gbaseResult.dataSize).toBe(66);
    expect(polardbResult.dataSize).toBe(66);
  });

  it('should fallback to mysql profile when db type is unknown', () => {
    const result = estimateStorage('unknown-db' as any, fields);
    expect(result.dbName).toBe('MySQL (InnoDB)');
    expect(result.rowOverhead).toBe(5 + 6 + 7 + 1);
  });

  it('should cover float53 char date bit and blob sizing branches', () => {
    const specialFields: NormalizedField[] = [
      {
        name: 'f1',
        type: 'float(53)',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f2',
        type: 'char(10)',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f3',
        type: 'date',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f4',
        type: 'bit',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'f5',
        type: 'blob',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const mysqlResult = estimateStorage('mysql', specialFields);
    const pgResult = estimateStorage('postgresql', specialFields);

    expect(mysqlResult.dataSize).toBe(42);
    expect(pgResult.dataSize).toBe(48);
    expect(pgResult.dataSize).toBeGreaterThan(mysqlResult.dataSize);
  });

  describe('Hive storage formats', () => {
    const hiveFields: NormalizedField[] = [
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
    ];

    it('should use ORC profile by default for Hive', () => {
      const result = estimateStorage('hive', hiveFields);
      expect(result.dbName).toBe('Hive (ORC)');
      // ORC: 75% compression -> rawData = 8 + 50 = 58, compressed = ceil(58 * 0.25) = 15
      expect(result.dataSize).toBe(15);
    });

    it('should use ORC profile when storageFormat is ORC', () => {
      const result = estimateStorage('hive', hiveFields, 'ORC');
      expect(result.dbName).toBe('Hive (ORC)');
      expect(result.dataSize).toBe(15);
    });

    it('should use Parquet profile when storageFormat is PARQUET', () => {
      const result = estimateStorage('hive', hiveFields, 'PARQUET');
      expect(result.dbName).toBe('Hive (Parquet)');
      // Parquet: 55% compression -> rawData = 58, compressed = ceil(58 * 0.45) = 27
      expect(result.dataSize).toBe(27);
    });

    it('should use TEXTFILE profile when storageFormat is TEXTFILE', () => {
      const result = estimateStorage('hive', hiveFields, 'TEXTFILE');
      expect(result.dbName).toBe('Hive (TEXTFILE)');
      // TEXTFILE: no compression -> rawData = 58
      expect(result.dataSize).toBe(58);
    });

    it('should be case-insensitive for storageFormat', () => {
      const upperResult = estimateStorage('hive', hiveFields, 'PARQUET');
      const lowerResult = estimateStorage('hive', hiveFields, 'parquet');
      expect(upperResult.dbName).toBe(lowerResult.dbName);
      expect(upperResult.dataSize).toBe(lowerResult.dataSize);
    });

    it('should fallback to ORC for unknown storageFormat', () => {
      const result = estimateStorage('hive', hiveFields, 'UNKNOWN_FORMAT');
      expect(result.dbName).toBe('Hive (ORC)');
    });

    it('should ignore storageFormat for non-Hive databases', () => {
      const mysqlResult = estimateStorage('mysql', hiveFields, 'ORC');
      expect(mysqlResult.dbName).toBe('MySQL (InnoDB)');

      const pgResult = estimateStorage('postgresql', hiveFields, 'PARQUET');
      expect(pgResult.dbName).toBe('PostgreSQL');
    });
  });
});
