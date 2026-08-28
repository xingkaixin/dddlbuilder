import type { DatabaseType, IndexDefinition, NormalizedField } from '@ddlbuilder/shared-types';
import { getDatabaseFamily } from './databaseFamily.js';
import { parseFieldType } from './databaseTypeMapping.js';
import { canonicalizeBaseType } from './typeAliases.js';

export interface StorageResult {
  rowOverhead: number;
  dataSize: number;
  totalRowSize: number;
  dbName: string;
}

export interface StorageProfile {
  name: string;
  calculateRowSize: (fields: NormalizedField[]) => {
    overhead: number;
    data: number;
  };
}

/**
 * 估算常用类型的字节占用
 */
function getFieldSize(type: string, dbType: DatabaseType): number {
  const { baseType, args } = parseFieldType(type);
  const canonicalType = canonicalizeBaseType(baseType);
  const databaseFamily = getDatabaseFamily(dbType);

  if (canonicalType === 'bigint') return 8;
  if (canonicalType === 'smallint') return 2;
  if (canonicalType === 'tinyint') return 1;
  if (['int', 'integer', 'mediumint'].includes(canonicalType)) return 4;
  if (canonicalType === 'double' || (canonicalType === 'float' && args[0] === '53')) return 8;
  if (canonicalType === 'float' || canonicalType === 'real') return 4;
  if (canonicalType.includes('datetime') || canonicalType.includes('timestamp')) return 8;
  if (canonicalType === 'date') return 3;
  if (canonicalType === 'boolean' || canonicalType === 'bit') return 1;

  // 变长字段处理 (假设平均长度为定义长度的 50%)
  if (['varchar', 'nvarchar', 'char', 'nchar'].includes(canonicalType) && args[0]) {
    const len = Number.parseInt(args[0], 10);
    if (!Number.isFinite(len)) return 8;
    const isN = canonicalType === 'nchar' || canonicalType === 'nvarchar';
    const factor = isN ? 2 : 1;
    if (canonicalType === 'char' || canonicalType === 'nchar') return len * factor;
    return Math.ceil(len * 0.5) * factor; // 默认按 50% 填充率估算
  }

  // LOB 字段 (仅计算行内指针)
  if (canonicalType.includes('text') || canonicalType === 'blob') {
    if (databaseFamily === 'mysql') return 20; // 溢出页指针
    if (databaseFamily === 'postgresql') return 24; // TOAST 指针
    return 32;
  }

  return 8; // 默认
}

// 同族数据库行开销公式一致，仅字段大小按各自 dbType 计算（getFieldSize 按 family 分支，同族等价）
const mysqlLikeProfile = (name: string, dbType: DatabaseType): StorageProfile => ({
  name,
  calculateRowSize: (fields) => {
    // 隐藏列: TRX_ID(6) + ROLL_PTR(7) + ROW_ID(6, 假设有主键时不计)
    let overhead = 5 + 6 + 7;
    const data = fields.reduce((acc, f) => acc + getFieldSize(f.type, dbType), 0);
    overhead += Math.ceil(fields.filter((f) => f.nullable).length / 8);

    return {
      overhead,
      data,
    };
  },
});

const postgresLikeProfile = (name: string, dbType: DatabaseType): StorageProfile => ({
  name,
  calculateRowSize: (fields) => {
    const overhead = 23 + 4; // Header + ItemID
    let data = fields.reduce((acc, f) => acc + getFieldSize(f.type, dbType), 0);

    // 对齐补全 (粗略估算)
    data += Math.ceil(data / 8) * 8 - data;

    return {
      overhead,
      data,
    };
  },
});

const TiDBProfile: StorageProfile = {
  name: 'TiDB (TiKV)',
  calculateRowSize: (fields) => {
    // TiDB 每行转换成 KV，Key 大约 10-20 字节，Value 含列数据
    const overhead = 20;
    const data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'tidb'), 0);

    return {
      overhead,
      data: data * 3, // 默认三副本
    };
  },
};

const OceanBaseProfile: StorageProfile = {
  name: 'OceanBase',
  calculateRowSize: (fields) => {
    const dataSize = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'oceanbase'), 0);
    // OceanBase 高压缩率，假设 70% 压缩
    const compressedData = Math.ceil(dataSize * 0.3);

    return {
      overhead: 10,
      data: compressedData,
    };
  },
};

const OracleProfile: StorageProfile = {
  name: 'Oracle',
  calculateRowSize: (fields) => {
    const overhead = 3; // 行头
    const columnOverhead = fields.length; // 每个字段约 1 字节长度标识
    const data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'oracle'), 0);

    return {
      overhead: overhead + columnOverhead,
      data,
    };
  },
};

const SqlServerProfile: StorageProfile = {
  name: 'SQL Server',
  calculateRowSize: (fields) => {
    const overhead = 4 + 2; // Row Header + Null Bitmap Header
    const nullBitmap = Math.ceil(fields.filter((f) => f.nullable).length / 8);
    const data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'sqlserver'), 0);

    return {
      overhead: overhead + nullBitmap,
      data,
    };
  },
};

const HiveOrcProfile: StorageProfile = {
  name: 'Hive (ORC)',
  calculateRowSize: (fields) => {
    const overhead = 16; // ORC 行组元数据 + 索引
    const rawData = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'hive'), 0);
    const compressedData = Math.ceil(rawData * 0.25); // ORC 75% 压缩

    return {
      overhead,
      data: compressedData,
    };
  },
};

const HiveParquetProfile: StorageProfile = {
  name: 'Hive (Parquet)',
  calculateRowSize: (fields) => {
    const overhead = 12; // Parquet 页级元数据
    const rawData = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'hive'), 0);
    const compressedData = Math.ceil(rawData * 0.45); // Parquet 55% 压缩

    return {
      overhead,
      data: compressedData,
    };
  },
};

const HiveTextfileProfile: StorageProfile = {
  name: 'Hive (TEXTFILE)',
  calculateRowSize: (fields) => {
    const overhead = 1; // 行分隔符
    const data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'hive'), 0);

    return {
      overhead,
      data,
    };
  },
};

const HiveProfiles: Record<string, StorageProfile> = {
  ORC: HiveOrcProfile,
  PARQUET: HiveParquetProfile,
  TEXTFILE: HiveTextfileProfile,
};

const Profiles = {
  mysql: mysqlLikeProfile('MySQL (InnoDB)', 'mysql'),
  mariadb: mysqlLikeProfile('MySQL (InnoDB)', 'mariadb'),
  tidb: TiDBProfile,
  postgresql: postgresLikeProfile('PostgreSQL', 'postgresql'),
  'postgresql-citus': postgresLikeProfile('PostgreSQL', 'postgresql-citus'),
  oceanbase: OceanBaseProfile,
  'oceanbase-oracle': OceanBaseProfile,
  oracle: OracleProfile,
  sqlserver: SqlServerProfile,
  dm: OracleProfile, // 达梦参考 Oracle
  kingbase: postgresLikeProfile('Kingbase', 'kingbase'),
  gbase: mysqlLikeProfile('GBase', 'gbase'),
  polardb: mysqlLikeProfile('PolarDB', 'polardb'),
  gaussdb: postgresLikeProfile('GaussDB', 'gaussdb'),
  hive: HiveOrcProfile,
} satisfies Record<DatabaseType, StorageProfile>;

export function estimateStorage(
  dbType: DatabaseType,
  fields: NormalizedField[],
  storageFormat?: string,
): StorageResult {
  const profile =
    dbType === 'hive' && storageFormat
      ? HiveProfiles[storageFormat.toUpperCase()] || HiveOrcProfile
      : Profiles[dbType];
  const { overhead, data } = profile.calculateRowSize(fields);

  return {
    dbName: profile.name,
    rowOverhead: overhead,
    dataSize: data,
    totalRowSize: overhead + data,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Breakdown: raw data + index + redundancy
// ─────────────────────────────────────────────────────────────────────────────

export interface StorageBreakdown {
  dbName: string;
  rawDataPerRow: number;
  indexPerRow: number;
  redundancyPerRow: number;
  totalPerRow: number;
  clusteredIndexes: boolean;
  redundancyRate: number;
}

// Databases where the PK is the clustered index (no separate PK B-tree needed)
const CLUSTERED_DATABASES = new Set<DatabaseType>([
  'mysql',
  'mariadb',
  'tidb',
  'polardb',
  'gbase',
  'oceanbase',
]);

// Physical row locator size for non-clustered (heap) databases
const HEAP_LOCATOR_SIZES: Partial<Record<DatabaseType, number>> = {
  oracle: 10,
  dm: 10,
  'oceanbase-oracle': 10,
  sqlserver: 8,
};

function getHeapLocatorSize(dbType: DatabaseType): number {
  return HEAP_LOCATOR_SIZES[dbType] ?? 6; // CTID for PG family
}

// Multiplier applied to raw index bytes for certain databases
// (mirrors the same factor used in the data profiles above)
const INDEX_STORAGE_FACTORS: Partial<Record<DatabaseType, number>> = {
  tidb: 3, // Raft 3-replica — same as data
  oceanbase: 0.3, // LSM-tree compression — same ratio as data
  'oceanbase-oracle': 0.3,
};

// Fraction of (rawData + index) bytes added as redundancy overhead
const REDUNDANCY_FACTORS = {
  mysql: 0.3,
  mariadb: 0.3,
  tidb: 0.2,
  postgresql: 0.25,
  'postgresql-citus': 0.25,
  oceanbase: 0.1,
  'oceanbase-oracle': 0.1,
  oracle: 0.15,
  sqlserver: 0.15,
  dm: 0.15,
  kingbase: 0.25,
  gbase: 0.3,
  polardb: 0.15,
  gaussdb: 0.25,
  hive: 0.05,
} satisfies Record<DatabaseType, number>;

// B-tree overhead factor: accounts for non-leaf nodes and fill-factor gaps
const BTREE_OVERHEAD = 1.6;
const BTREE_ENTRY_OVERHEAD = 10; // bytes per leaf entry (page format headers)

function computeIndexBytesPerRow(
  dbType: DatabaseType,
  fields: NormalizedField[],
  indexes: IndexDefinition[],
): number {
  if (dbType === 'hive') {
    return 0;
  }

  if (indexes.length === 0) {
    return 0;
  }

  const fieldMap = new Map(fields.map((f) => [f.name, f]));
  const isClustered = CLUSTERED_DATABASES.has(dbType);

  const pkIndex = indexes.find((idx) => idx.kind === 'primary');
  const pkKeySize = pkIndex
    ? pkIndex.fields.reduce((sum, f) => {
        const field = fieldMap.get(f.name);
        return sum + (field ? getFieldSize(field.type, dbType) : 8);
      }, 0)
    : 6; // default row-id size when no PK defined

  let totalBytesPerRow = 0;
  for (const index of indexes) {
    if (index.kind === 'primary' && isClustered) {
      continue;
    }

    const keySize =
      index.kind === 'primary'
        ? pkKeySize
        : index.fields.reduce((sum, f) => {
            const field = fieldMap.get(f.name);
            return sum + (field ? getFieldSize(field.type, dbType) : 8);
          }, 0);

    // Row locator: PK columns (clustered) or physical row ID (heap)
    const locator = isClustered ? pkKeySize : getHeapLocatorSize(dbType);
    const entrySize = (keySize + locator + BTREE_ENTRY_OVERHEAD) * BTREE_OVERHEAD;
    totalBytesPerRow += entrySize;
  }

  const factor = INDEX_STORAGE_FACTORS[dbType] ?? 1;
  return Math.ceil(totalBytesPerRow * factor);
}

function computeRedundancyBytesPerRow(
  dbType: DatabaseType,
  rawDataPerRow: number,
  indexPerRow: number,
): { bytesPerRow: number; rate: number } {
  if (dbType === 'hive') {
    return { bytesPerRow: 0, rate: 0 };
  }

  const factor = REDUNDANCY_FACTORS[dbType];
  const bytesPerRow = Math.ceil((rawDataPerRow + indexPerRow) * factor);
  return { bytesPerRow, rate: factor };
}

export function estimateStorageBreakdown(
  dbType: DatabaseType,
  fields: NormalizedField[],
  indexes: IndexDefinition[],
  storageFormat?: string,
): StorageBreakdown {
  const storageResult = estimateStorage(dbType, fields, storageFormat);
  const rawDataPerRow = storageResult.totalRowSize;

  const indexPerRow = computeIndexBytesPerRow(dbType, fields, indexes);

  const { bytesPerRow: redundancyPerRow, rate: redundancyRate } = computeRedundancyBytesPerRow(
    dbType,
    rawDataPerRow,
    indexPerRow,
  );

  return {
    dbName: storageResult.dbName,
    rawDataPerRow,
    indexPerRow,
    redundancyPerRow,
    totalPerRow: rawDataPerRow + indexPerRow + redundancyPerRow,
    clusteredIndexes: CLUSTERED_DATABASES.has(dbType),
    redundancyRate,
  };
}
