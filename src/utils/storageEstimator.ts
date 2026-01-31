import type { DatabaseType, NormalizedField } from '@/types';

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
    const data = fields.reduce(
      (acc, f) => acc + getFieldSize(f.type, 'mysql'),
      0,
    );
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
    let data = fields.reduce(
      (acc, f) => acc + getFieldSize(f.type, 'postgresql'),
      0,
    );

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
    const data = fields.reduce(
      (acc, f) => acc + getFieldSize(f.type, 'tidb'),
      0,
    );

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
    const dataSize = fields.reduce(
      (acc, f) => acc + getFieldSize(f.type, 'oceanbase'),
      0,
    );
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
    const data = fields.reduce(
      (acc, f) => acc + getFieldSize(f.type, 'oracle'),
      0,
    );

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
    const data = fields.reduce(
      (acc, f) => acc + getFieldSize(f.type, 'sqlserver'),
      0,
    );

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
};

export function estimateStorage(
  dbType: DatabaseType,
  fields: NormalizedField[],
): StorageResult {
  const profile = Profiles[dbType] || MySQLProfile;
  const { overhead, data, explanation } = profile.calculateRowSize(fields);

  return {
    dbName: profile.name,
    rowOverhead: overhead,
    dataSize: data,
    totalRowSize: overhead + data,
    explanation,
  };
}
