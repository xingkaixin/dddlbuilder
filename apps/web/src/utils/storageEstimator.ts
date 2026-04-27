import type { DatabaseType, IndexDefinition, NormalizedField } from '@ddlbuilder/shared-types';

export interface StorageResult {
  rowOverhead: number;
  dataSize: number;
  totalRowSize: number;
  explanation: string[];
  dbName: string;
}

export interface StorageProfile {
  name: string;
  calculateRowSize: (fields: NormalizedField[]) => {
    overhead: number;
    data: number;
    explanation: string[];
  };
}

/**
 * 估算常用类型的字节占用
 */
function getFieldSize(type: string, dbType: DatabaseType): number {
  const t = type.toLowerCase();

  // 通用规则
  if (t.includes('bigint')) return 8;
  if (t.includes('smallint')) return 2;
  if (t.includes('tinyint')) return 1;
  if (t.includes('int')) return 4;
  if (t.includes('double') || t.includes('float(53)')) return 8;
  if (t.includes('float')) return 4;
  if (t.includes('datetime') || t.includes('timestamp')) return 8; // 粗略估算
  if (t.includes('date')) return 3;
  if (t.includes('boolean') || t.includes('bit')) return 1;

  // 变长字段处理 (假设平均长度为定义长度的 50%)
  const varcharMatch = t.match(/(?:varchar|nvarchar|char|nchar)\((\d+)\)/);
  if (varcharMatch) {
    const len = parseInt(varcharMatch[1], 10);
    const isN = t.includes('nchar') || t.includes('nvarchar');
    const factor = isN ? 2 : 1;
    if (t.startsWith('char') || t.startsWith('nchar')) return len * factor;
    return Math.ceil(len * 0.5) * factor; // 默认按 50% 填充率估算
  }

  // LOB 字段 (仅计算行内指针)
  if (t.includes('text') || t.includes('blob') || t.includes('clob')) {
    if (dbType === 'mysql') return 20; // 溢出页指针
    if (dbType === 'postgresql') return 24; // TOAST 指针
    return 32;
  }

  return 8; // 默认
}

const MySQLProfile: StorageProfile = {
  name: 'MySQL (InnoDB)',
  calculateRowSize: (fields) => {
    // 隐藏列: TRX_ID(6) + ROLL_PTR(7) + ROW_ID(6, 假设有主键时不计)
    let overhead = 5 + 6 + 7;
    const data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'mysql'), 0);
    const nullBitmap = Math.ceil(fields.filter((f) => f.nullable).length / 8);
    overhead += nullBitmap;

    return {
      overhead,
      data,
      explanation: [
        '包含 InnoDB 记录头 (5字节)',
        '包含隐藏事务 ID (6字节) 与回滚指针 (7字节)',
        `包含 Null 值位图 (${nullBitmap}字节)`,
        '未计算索引、页间隙及磁盘碎片开销',
      ],
    };
  },
};

const PostgresProfile: StorageProfile = {
  name: 'PostgreSQL',
  calculateRowSize: (fields) => {
    const overhead = 23 + 4; // Header + ItemID
    let data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'postgresql'), 0);

    // 对齐补全 (粗略估算)
    const padding = Math.ceil(data / 8) * 8 - data;
    data += padding;

    return {
      overhead,
      data,
      explanation: [
        '包含堆元组头 (23字节) 与行指针 (4字节)',
        `已计入估算的 8 字节对齐补全 (${padding}字节)`,
        'PG 具有较强的 MVCC 开销，旧版本数据会额外占用空间直到被 VACUUM',
      ],
    };
  },
};

const TiDBProfile: StorageProfile = {
  name: 'TiDB (TiKV)',
  calculateRowSize: (fields) => {
    // TiDB 每行转换成 KV，Key 大约 10-20 字节，Value 含列数据
    const overhead = 20;
    const data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'tidb'), 0);

    return {
      overhead,
      data: data * 3, // 默认三副本
      explanation: [
        'TiDB 默认采用 Raft 三副本存储，估算值已包含副本冗余',
        '包含 TiKV Key 前缀及事务 CommitTS 开销',
        '存储成本受全局单调生成的有序 Key 影响',
      ],
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
      explanation: [
        'OceanBase 采用 LSM-Tree 架构，具备极高性能的压缩能力',
        '当前结果基于 70% 的平均压缩率进行估算',
        '增量数据在早期会存储在 MemTable，后期通过 Major Freeze 归档到 SSTable',
      ],
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
      explanation: [
        'Oracle 采用极简行头 (3字节)，每个列附带 1-3 字节长度标识',
        '未考虑表空间 PCTFREE 预留空间 (默认 10%)',
        '变长数字 (NUMBER) 按实际有效位存储',
      ],
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
      explanation: [
        '包含 SQL Server 行头 (4字节) 及状态字节',
        `包含 Null 值位图开销 (${nullBitmap}字节)`,
        '变长列超出 8060 字节会发生行溢出 (Off-page)',
      ],
    };
  },
};

const KingbaseProfile: StorageProfile = {
  name: 'Kingbase (人大金仓)',
  calculateRowSize: (fields) => {
    // Kingbase 基于 PostgreSQL，使用类似的计算逻辑
    const overhead = 23 + 4; // Header + ItemID
    let data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'kingbase'), 0);

    // 对齐补全 (粗略估算)
    const padding = Math.ceil(data / 8) * 8 - data;
    data += padding;

    return {
      overhead,
      data,
      explanation: [
        'Kingbase 基于 PostgreSQL 内核，采用堆元组存储格式',
        '包含堆元组头 (23字节) 与行指针 (4字节)',
        `已计入估算的 8 字节对齐补全 (${padding}字节)`,
        '支持国产加密及审计特性，会额外占用少量元数据空间',
      ],
    };
  },
};

const GBaseProfile: StorageProfile = {
  name: 'GBase (南大通用)',
  calculateRowSize: (fields) => {
    // GBase 基于 MySQL，使用类似的计算逻辑
    let overhead = 5 + 6 + 7; // 隐藏列开销
    const data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'gbase'), 0);
    const nullBitmap = Math.ceil(fields.filter((f) => f.nullable).length / 8);
    overhead += nullBitmap;

    return {
      overhead,
      data,
      explanation: [
        'GBase 兼容 MySQL 协议，采用类似的 InnoDB 存储格式',
        '包含 InnoDB 记录头 (5字节)',
        '包含隐藏事务 ID (6字节) 与回滚指针 (7字节)',
        `包含 Null 值位图 (${nullBitmap}字节)`,
        '支持列存储模式，如使用列存则实际占用会显著不同',
      ],
    };
  },
};

const PolarDBProfile: StorageProfile = {
  name: 'PolarDB (阿里云)',
  calculateRowSize: (fields) => {
    // PolarDB 基于 MySQL，使用类似的计算逻辑
    let overhead = 5 + 6 + 7; // 隐藏列开销
    const data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'polardb'), 0);
    const nullBitmap = Math.ceil(fields.filter((f) => f.nullable).length / 8);
    overhead += nullBitmap;

    return {
      overhead,
      data,
      explanation: [
        'PolarDB 完全兼容 MySQL，采用共享存储架构',
        '包含 InnoDB 记录头 (5字节)',
        '包含隐藏事务 ID (6字节) 与回滚指针 (7字节)',
        `包含 Null 值位图 (${nullBitmap}字节)`,
        '共享存储模式下，数据只需存储一份，大幅降低存储成本',
      ],
    };
  },
};

const GaussDBProfile: StorageProfile = {
  name: 'GaussDB (华为)',
  calculateRowSize: (fields) => {
    // GaussDB 基于 PostgreSQL，使用类似的计算逻辑
    const overhead = 23 + 4; // Header + ItemID
    let data = fields.reduce((acc, f) => acc + getFieldSize(f.type, 'gaussdb'), 0);

    // 对齐补全 (粗略估算)
    const padding = Math.ceil(data / 8) * 8 - data;
    data += padding;

    return {
      overhead,
      data,
      explanation: [
        'GaussDB 基于 PostgreSQL 内核，采用分布式架构',
        '包含堆元组头 (23字节) 与行指针 (4字节)',
        `已计入估算的 8 字节对齐补全 (${padding}字节)`,
        '分布式部署下数据有多副本，实际存储需乘以副本数',
        '支持高压缩存储，开启压缩后实际占用可降低 50-70%',
      ],
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
      explanation: [
        'ORC 采用列式存储，支持字典编码、RLE 及 Snappy/LZO 压缩',
        '当前结果基于 75% 的平均压缩率进行估算',
        'ORC 文件包含 Stripe (默认 64MB) 和 Row Group 级别的索引',
        '小文件场景下索引开销占比会显著增大',
      ],
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
      explanation: [
        'Parquet 采用列式存储，支持页级 Snappy/Gzip 压缩',
        '当前结果基于 55% 的平均压缩率进行估算',
        'Parquet 文件包含 Row Group 和 Page 级别的统计信息',
        '适合 Spark/Presto 等计算引擎的高效扫描',
      ],
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
      explanation: [
        'TEXTFILE 为纯文本存储，无压缩，按分隔符划分列',
        '适合小数据量调试或需要直接读取原始文件的场景',
        '不推荐用于生产环境，存储效率较低',
      ],
    };
  },
};

const HiveProfiles: Record<string, StorageProfile> = {
  ORC: HiveOrcProfile,
  PARQUET: HiveParquetProfile,
  TEXTFILE: HiveTextfileProfile,
};

const Profiles: Record<string, StorageProfile> = {
  mysql: MySQLProfile,
  mariadb: MySQLProfile,
  tidb: TiDBProfile,
  postgresql: PostgresProfile,
  'postgresql-citus': PostgresProfile,
  oceanbase: OceanBaseProfile,
  'oceanbase-oracle': OceanBaseProfile,
  oracle: OracleProfile,
  sqlserver: SqlServerProfile,
  dm: OracleProfile, // 达梦参考 Oracle
  kingbase: KingbaseProfile,
  gbase: GBaseProfile,
  polardb: PolarDBProfile,
  gaussdb: GaussDBProfile,
  hive: HiveOrcProfile,
};

export function estimateStorage(
  dbType: DatabaseType,
  fields: NormalizedField[],
  storageFormat?: string,
): StorageResult {
  const profile =
    dbType === 'hive' && storageFormat
      ? HiveProfiles[storageFormat.toUpperCase()] || HiveOrcProfile
      : Profiles[dbType] || MySQLProfile;
  const { overhead, data, explanation } = profile.calculateRowSize(fields);

  return {
    dbName: profile.name,
    rowOverhead: overhead,
    dataSize: data,
    totalRowSize: overhead + data,
    explanation,
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
  dataExplanation: string[];
  indexExplanation: string[];
  redundancyExplanation: string[];
}

// Databases where the PK is the clustered index (no separate PK B-tree needed)
const CLUSTERED_DATABASES = new Set<string>([
  'mysql',
  'mariadb',
  'tidb',
  'polardb',
  'gbase',
  'oceanbase',
]);

// Physical row locator size for non-clustered (heap) databases
const HEAP_LOCATOR_SIZES: Partial<Record<string, number>> = {
  oracle: 10,
  dm: 10,
  'oceanbase-oracle': 10,
  sqlserver: 8,
};

function getHeapLocatorSize(dbType: string): number {
  return HEAP_LOCATOR_SIZES[dbType] ?? 6; // CTID for PG family
}

// Multiplier applied to raw index bytes for certain databases
// (mirrors the same factor used in the data profiles above)
const INDEX_STORAGE_FACTORS: Partial<Record<string, number>> = {
  tidb: 3, // Raft 3-replica — same as data
  oceanbase: 0.3, // LSM-tree compression — same ratio as data
  'oceanbase-oracle': 0.3,
};

// Fraction of (rawData + index) bytes added as redundancy overhead
const REDUNDANCY_FACTORS: Partial<Record<string, number>> = {
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
};

const REDUNDANCY_DESCRIPTIONS: Partial<Record<string, string>> = {
  mysql: 'InnoDB 随机写页碎片 + 事务 Undo 日志预留',
  mariadb: 'InnoDB 随机写页碎片 + 事务 Undo 日志预留',
  tidb: 'Raft 日志写入放大 + Compaction 开销（三副本已含在裸数据中）',
  postgresql: 'MVCC 旧版本行（dead tuple）+ autovacuum 延迟清理',
  'postgresql-citus': 'MVCC dead tuple + 分片元数据 + 跨节点一致性开销',
  oceanbase: 'MemTable → SSTable Compaction 写放大，压缩后冗余极低',
  'oceanbase-oracle': 'MemTable → SSTable 写放大，Oracle 兼容模式下 Undo 空间预留',
  oracle: 'PCTFREE 默认 10% 页内预留 + 行迁移防护',
  sqlserver: 'Fill Factor 默认 80% + B-Tree 页分裂碎片',
  dm: 'PCTFREE 预留 + 行迁移防护（参考 Oracle 模型）',
  kingbase: 'MVCC dead tuple + autovacuum（基于 PostgreSQL 内核）',
  gbase: 'InnoDB 页碎片 + 事务 Undo 预留（参考 MySQL 模型）',
  polardb: '共享存储架构减少副本碎片；PCTFREE 15% 作为更新缓冲',
  gaussdb: 'MVCC dead tuple + 分布式多副本写放大（建议参考实际副本数）',
  hive: 'Hive 列式格式（ORC/Parquet）存储效率极高，冗余开销可忽略',
};

// B-tree overhead factor: accounts for non-leaf nodes and fill-factor gaps
const BTREE_OVERHEAD = 1.6;
const BTREE_ENTRY_OVERHEAD = 10; // bytes per leaf entry (page format headers)

function computeIndexBytesPerRow(
  dbType: DatabaseType,
  fields: NormalizedField[],
  indexes: IndexDefinition[],
): { bytesPerRow: number; explanation: string[] } {
  if (dbType === 'hive') {
    return {
      bytesPerRow: 0,
      explanation: [
        'Hive 列式格式（ORC/Parquet）通过内置的 Stripe/RowGroup 级统计信息实现谓词下推，无传统 B-Tree 索引',
      ],
    };
  }

  if (indexes.length === 0) {
    return { bytesPerRow: 0, explanation: ['当前表未定义任何索引，索引占用为 0'] };
  }

  const fieldMap = new Map(fields.map((f) => [f.name, f]));
  const isClustered = CLUSTERED_DATABASES.has(dbType);

  const pkIndex = indexes.find((idx) => idx.isPrimary);
  const pkKeySize = pkIndex
    ? pkIndex.fields.reduce((sum, f) => {
        const field = fieldMap.get(f.name);
        return sum + (field ? getFieldSize(field.type, dbType) : 8);
      }, 0)
    : 6; // default row-id size when no PK defined

  let totalBytesPerRow = 0;
  const indexSummaries: string[] = [];

  for (const index of indexes) {
    if (index.isPrimary && isClustered) {
      indexSummaries.push(`主键（${index.name}）：聚簇索引，成本已含在行数据中，无额外占用`);
      continue;
    }

    const keySize = index.isPrimary
      ? pkKeySize
      : index.fields.reduce((sum, f) => {
          const field = fieldMap.get(f.name);
          return sum + (field ? getFieldSize(field.type, dbType) : 8);
        }, 0);

    // Row locator: PK columns (clustered) or physical row ID (heap)
    const locator = isClustered ? pkKeySize : getHeapLocatorSize(dbType);
    const entrySize = (keySize + locator + BTREE_ENTRY_OVERHEAD) * BTREE_OVERHEAD;
    totalBytesPerRow += entrySize;

    const label = index.isPrimary ? '主键' : index.unique ? '唯一索引' : '普通索引';
    indexSummaries.push(`${label}（${index.name}）≈ ${Math.ceil(entrySize)} B/行`);
  }

  const explanation: string[] = [...indexSummaries];
  if (isClustered && pkIndex) {
    explanation.push('聚簇表：二级索引的行定位器为主键列，非物理行 ID');
  }
  if (!isClustered) {
    explanation.push('非聚簇存储：主键及所有索引均为独立的 B-Tree 结构');
  }
  explanation.push(
    `B-Tree 估算系数 ${BTREE_OVERHEAD}×（含非叶节点 20% + 随机写填充率损耗 30%）`,
  );

  const factor = INDEX_STORAGE_FACTORS[dbType] ?? 1;
  return { bytesPerRow: Math.ceil(totalBytesPerRow * factor), explanation };
}

function computeRedundancyBytesPerRow(
  dbType: DatabaseType,
  rawDataPerRow: number,
  indexPerRow: number,
): { bytesPerRow: number; explanation: string[] } {
  if (dbType === 'hive') {
    return {
      bytesPerRow: 0,
      explanation: [REDUNDANCY_DESCRIPTIONS.hive ?? '列式格式冗余可忽略'],
    };
  }

  const factor = REDUNDANCY_FACTORS[dbType] ?? 0.2;
  const bytesPerRow = Math.ceil((rawDataPerRow + indexPerRow) * factor);
  const description = REDUNDANCY_DESCRIPTIONS[dbType] ?? '页碎片 + 系统元数据预留';

  return {
    bytesPerRow,
    explanation: [
      `冗余开销率 ${(factor * 100).toFixed(0)}%：${description}`,
      '基于（裸数据 + 索引）合计估算，实际开销受写入模式影响较大',
    ],
  };
}

export function estimateStorageBreakdown(
  dbType: DatabaseType,
  fields: NormalizedField[],
  indexes: IndexDefinition[],
  storageFormat?: string,
): StorageBreakdown {
  const storageResult = estimateStorage(dbType, fields, storageFormat);
  const rawDataPerRow = storageResult.totalRowSize;

  const { bytesPerRow: indexPerRow, explanation: indexExplanation } = computeIndexBytesPerRow(
    dbType,
    fields,
    indexes,
  );

  const { bytesPerRow: redundancyPerRow, explanation: redundancyExplanation } =
    computeRedundancyBytesPerRow(dbType, rawDataPerRow, indexPerRow);

  return {
    dbName: storageResult.dbName,
    rawDataPerRow,
    indexPerRow,
    redundancyPerRow,
    totalPerRow: rawDataPerRow + indexPerRow + redundancyPerRow,
    dataExplanation: storageResult.explanation,
    indexExplanation,
    redundancyExplanation,
  };
}
