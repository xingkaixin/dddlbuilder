import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import {
  getCanonicalBaseType,
  getDatabaseFamily,
  parseFieldType,
  quoteIdentifier,
} from '@ddlbuilder/ddl-core';

// ── 本地化数据池 ─────────────────────────────────────────────────────────────

const CN_SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'.split('');
const CN_NAMES_CHARS =
  '伟芳娜秀英敏静艳丽燕珊雪琳倩梅梦娟灿宇子鹏博昊峰磊帆军凯洋鑫浩然志成明亮辉强生'.split('');
const CN_CITIES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '成都',
  '武汉',
  '西安',
  '南京',
  '重庆',
  '天津',
  '苏州',
  '长沙',
  '青岛',
  '郑州',
  '大连',
  '东莞',
  '宁波',
  '厦门',
  '合肥',
];
const CN_PROVINCES = [
  '北京市',
  '天津市',
  '上海市',
  '重庆市',
  '河北省',
  '山西省',
  '辽宁省',
  '吉林省',
  '黑龙江省',
  '江苏省',
  '浙江省',
  '安徽省',
  '福建省',
  '江西省',
  '山东省',
  '河南省',
  '湖北省',
  '湖南省',
  '广东省',
  '海南省',
  '四川省',
  '贵州省',
  '云南省',
  '陕西省',
];
const CN_STREET_PREFIXES = [
  '中山',
  '解放',
  '人民',
  '建设',
  '和平',
  '光明',
  '新华',
  '学府',
  '科技',
  '幸福',
];
const CN_STREET_SUFFIXES = ['路', '街', '大道', '巷', '弄'];
const CN_DISTRICTS = [
  '南山区',
  '福田区',
  '罗湖区',
  '天河区',
  '海珠区',
  '越秀区',
  '朝阳区',
  '西城区',
  '浦东新区',
  '江宁区',
];
const EMAIL_DOMAINS = [
  'gmail.com',
  '163.com',
  'qq.com',
  'hotmail.com',
  '126.com',
  'yeah.net',
  'sina.com',
];
const COMPANY_SUFFIXES = [
  '科技有限公司',
  '信息技术有限公司',
  '软件有限公司',
  '网络科技有限公司',
  '数据技术股份有限公司',
];
const CN_ADJECTIVES = [
  '智能',
  '云端',
  '数字',
  '创新',
  '聚合',
  '星链',
  '蓝海',
  '绿源',
  '融通',
  '汇聚',
];

// ── 随机工具 ──────────────────────────────────────────────────────────────────

interface MockRandom {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  pickN: <T>(arr: readonly T[], n: number) => T[];
}

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number | string): () => number {
  let state = hashSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createMockRandom(seed: number | string): MockRandom {
  const next = createSeededRandom(seed);
  const int = (min: number, max: number): number => Math.floor(next() * (max - min + 1)) + min;
  const pick = <T>(arr: readonly T[]): T => arr[int(0, arr.length - 1)];

  const pickN = <T>(arr: readonly T[], n: number): T[] => {
    const pool = [...arr];
    const count = Math.min(n, pool.length);

    for (let i = 0; i < count; i++) {
      const swapIndex = int(i, pool.length - 1);
      [pool[i], pool[swapIndex]] = [pool[swapIndex], pool[i]];
    }

    return pool.slice(0, count);
  };

  return { next, int, pick, pickN };
}

// ── 语义生成函数 ──────────────────────────────────────────────────────────────

const RANDOM_STRING_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

function genChineseName(rng: MockRandom): string {
  const nameLen = rng.next() < 0.3 ? 3 : 2;
  const given = rng.pickN(CN_NAMES_CHARS, nameLen - 1).join('');

  return `${rng.pick(CN_SURNAMES)}${given}`;
}

function genPhone(rng: MockRandom): string {
  const prefixes = [
    '130',
    '131',
    '132',
    '133',
    '135',
    '136',
    '137',
    '138',
    '139',
    '150',
    '151',
    '152',
    '153',
    '155',
    '156',
    '157',
    '158',
    '159',
    '176',
    '177',
    '178',
    '180',
    '181',
    '182',
    '183',
    '185',
    '186',
    '187',
    '188',
    '189',
  ];

  return `${rng.pick(prefixes)}${String(rng.int(10000000, 99999999))}`;
}

function genEmail(rng: MockRandom, prefix?: string): string {
  const localParts = prefix
    ? [prefix.toLowerCase().replace(/[^a-z0-9]/g, ''), String(rng.int(100, 9999))]
    : [
        String.fromCharCode(...Array.from({ length: rng.int(4, 8) }, () => rng.int(97, 122))),
        String(rng.int(100, 9999)),
      ];

  return `${localParts.join('_')}@${rng.pick(EMAIL_DOMAINS)}`;
}

function genAddress(rng: MockRandom): string {
  return `${rng.pick(CN_PROVINCES).replace(/省|市/, '')}省${rng.pick(CN_CITIES)}市${rng.pick(CN_DISTRICTS)}${rng.pick(CN_STREET_PREFIXES)}${rng.pick(CN_STREET_SUFFIXES)}${rng.int(1, 999)}号`;
}

function genCompany(rng: MockRandom): string {
  return `${rng.pick(CN_ADJECTIVES)}${rng.pick(CN_CITIES)}${rng.pick(COMPANY_SUFFIXES)}`;
}

function genIdCard(rng: MockRandom): string {
  const year = rng.int(1960, 2000);
  const month = String(rng.int(1, 12)).padStart(2, '0');
  const day = String(rng.int(1, 28)).padStart(2, '0');
  const seq = String(rng.int(100, 999));
  const suffix = rng.int(0, 9);

  return `4403${String(rng.int(10, 99))}${year}${month}${day}${seq}${suffix}`;
}

function genUUID(rng: MockRandom): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (rng.next() * 16) | 0;

    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function genIp(rng: MockRandom): string {
  return `${rng.int(1, 254)}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`;
}

function genRandomString(rng: MockRandom, maxLen = 20): string {
  const len = rng.int(Math.min(4, maxLen), Math.min(maxLen, 20));

  return Array.from({ length: len }, () => rng.pick(RANDOM_STRING_CHARS)).join('');
}

function genDate(rng: MockRandom): string {
  const y = rng.int(2020, 2025);
  const m = String(rng.int(1, 12)).padStart(2, '0');
  const d = String(rng.int(1, 28)).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

function genDatetime(rng: MockRandom): string {
  const date = genDate(rng);
  const h = String(rng.int(0, 23)).padStart(2, '0');
  const min = String(rng.int(0, 59)).padStart(2, '0');
  const s = String(rng.int(0, 59)).padStart(2, '0');

  return `${date} ${h}:${min}:${s}`;
}

function genTime(rng: MockRandom): string {
  const h = String(rng.int(0, 23)).padStart(2, '0');
  const m = String(rng.int(0, 59)).padStart(2, '0');
  const s = String(rng.int(0, 59)).padStart(2, '0');

  return `${h}:${m}:${s}`;
}

// ── 语义推断 ──────────────────────────────────────────────────────────────────

type SemanticHint =
  | 'chinese_name'
  | 'phone'
  | 'email'
  | 'address'
  | 'city'
  | 'province'
  | 'id_card'
  | 'age'
  | 'gender_text'
  | 'company'
  | 'uuid'
  | 'ip'
  | 'price'
  | 'status'
  | 'title'
  | 'description'
  | 'code'
  | 'url'
  | 'avatar'
  | 'count'
  | 'year'
  | null;

type MockDataValue = string | number | boolean | null | undefined;

const SEMANTIC_PATTERNS: Array<{ pattern: RegExp; hint: SemanticHint }> = [
  { pattern: /name|姓名|名称|名字|真实名/i, hint: 'chinese_name' },
  { pattern: /phone|mobile|tel|电话|手机|联系方式/i, hint: 'phone' },
  { pattern: /email|邮箱|邮件|mail/i, hint: 'email' },
  { pattern: /address|地址|住址/i, hint: 'address' },
  { pattern: /city|城市/i, hint: 'city' },
  { pattern: /province|省份|省/i, hint: 'province' },
  { pattern: /id_card|idcard|身份证/i, hint: 'id_card' },
  { pattern: /\bage\b|年龄/i, hint: 'age' },
  { pattern: /gender|sex|性别/i, hint: 'gender_text' },
  { pattern: /company|企业|单位|公司/i, hint: 'company' },
  { pattern: /uuid|guid/i, hint: 'uuid' },
  { pattern: /\bip\b|ip_address|ip地址/i, hint: 'ip' },
  { pattern: /price|金额|价格|费用|salary|工资/i, hint: 'price' },
  { pattern: /status|state|状态/i, hint: 'status' },
  { pattern: /title|标题|主题/i, hint: 'title' },
  { pattern: /description|content|备注|描述|内容|简介|remark/i, hint: 'description' },
  { pattern: /code|编码|编号|number/i, hint: 'code' },
  { pattern: /url|link|链接|网址|website|网站/i, hint: 'url' },
  { pattern: /avatar|头像|photo|portrait/i, hint: 'avatar' },
  { pattern: /count|num|数量|数目|total/i, hint: 'count' },
  { pattern: /year|年份|年/i, hint: 'year' },
];

function inferSemanticHint(fieldName: string, fieldComment: string): SemanticHint {
  const combined = `${fieldName} ${fieldComment}`;

  for (const { pattern, hint } of SEMANTIC_PATTERNS) {
    if (pattern.test(combined)) return hint;
  }

  return null;
}

// ── 字段值生成 ────────────────────────────────────────────────────────────────

function generateSemanticValue(
  field: NormalizedField,
  rng: MockRandom,
): string | number | undefined {
  const semantic = inferSemanticHint(field.name, field.comment ?? '');

  if (semantic) {
    switch (semantic) {
      case 'chinese_name':
        return genChineseName(rng);
      case 'phone':
        return genPhone(rng);
      case 'email':
        return genEmail(rng, field.name);
      case 'address':
        return genAddress(rng);
      case 'city':
        return rng.pick(CN_CITIES);
      case 'province':
        return rng.pick(CN_PROVINCES);
      case 'id_card':
        return genIdCard(rng);
      case 'age':
        return rng.int(18, 75);
      case 'gender_text':
        return rng.pick(['男', '女']);
      case 'company':
        return genCompany(rng);
      case 'uuid':
        return genUUID(rng);
      case 'ip':
        return genIp(rng);
      case 'price':
        return Number((rng.next() * 9999 + 1).toFixed(2));
      case 'status':
        return rng.int(0, 3);
      case 'title':
        return `${rng.pick(CN_ADJECTIVES)}${rng.pick(CN_CITIES)}${rng.pick(['项目', '方案', '计划', '报告', '通知'])}`;
      case 'description':
        return `${rng.pick(CN_CITIES)}${rng.pick(['数字化', '智能化', '信息化'])}建设${rng.pick(['项目', '工程', '方案'])}描述内容`;
      case 'code':
        return `${String.fromCharCode(rng.int(65, 90))}${String(rng.int(10000, 99999))}`;
      case 'url':
        return `https://example.com/${genRandomString(rng, 8)}`;
      case 'avatar':
        return `https://example.com/avatar/${rng.int(1, 1000)}.jpg`;
      case 'count':
        return rng.int(0, 9999);
      case 'year':
        return rng.int(2010, 2025);
    }
  }

  return undefined;
}

const INTEGER_BITS: ReadonlyMap<string, number> = new Map([
  ['tinyint', 8],
  ['smallint', 16],
  ['mediumint', 24],
  ['int', 32],
  ['bigint', 64],
  ['smallserial', 16],
  ['serial', 32],
  ['bigserial', 64],
]);

function generateDecimalValue(args: string[], preferred: number, rng: MockRandom): number {
  const precision = Number(args[0] ?? 10);
  const scale = Number(args[1] ?? 0);

  if (!Number.isSafeInteger(precision) || precision < 1 || !Number.isSafeInteger(scale)) return 0;

  const coefficient = Math.round(preferred * 10 ** scale);

  // Sample a bounded coefficient instead of rounding up past the column's maximum.
  const units =
    Number.isSafeInteger(coefficient) && Math.abs(coefficient) < 10 ** precision
      ? coefficient
      : rng.int(0, 10 ** Math.min(precision, 6) - 1);
  const value = Number(`${units}e${-scale}`);

  return Number.isFinite(value) ? value : 0;
}

function generateValueForField(
  field: NormalizedField,
  rowIndex: number,
  dbType: DatabaseType,
  rng: MockRandom,
): MockDataValue {
  if (field.nullable && field.defaultKind === 'none' && rng.next() < 0.1) return null;

  const parsed = parseFieldType(field.type);
  const baseType = getCanonicalBaseType(field.type);
  const args = parsed.args ?? [];
  const family = getDatabaseFamily(dbType);

  if (baseType === 'enum' || baseType === 'set') {
    if (args.length > 0) return rng.pick(args).replace(/^'|'$/g, '').replace(/''/g, "'");

    return 'value';
  }

  if (baseType === 'date') return genDate(rng);
  if (['datetime', 'datetime2', 'datetimeoffset', 'timestamp', 'timestamptz'].includes(baseType))
    return genDatetime(rng);
  if (baseType === 'time' || baseType === 'timetz') return genTime(rng);
  if (baseType === 'year') return rng.int(2010, 2025);
  if (baseType === 'json' || baseType === 'jsonb')
    return JSON.stringify({ id: rng.int(1, 999), value: genRandomString(rng, 6) });
  if (baseType === 'uuid' || baseType === 'uniqueidentifier') return genUUID(rng);

  const preferred =
    field.defaultKind === 'auto_increment'
      ? rowIndex + 1
      : field.defaultKind === 'uuid'
        ? genUUID(rng)
        : field.enumMeta?.length
          ? rng.pick(field.enumMeta).value
          : generateSemanticValue(field, rng);
  const numeric = Number(preferred);

  if (baseType === 'boolean') {
    const value = numeric === 0 || numeric === 1 ? numeric : rng.int(0, 1);

    return family === 'postgresql' || family === 'hive' ? Boolean(value) : value;
  }

  if (baseType === 'bit') {
    const length = Number(args[0] ?? 1);
    const bits = Number.isSafeInteger(length) && length > 0 ? Math.min(length, 53) : 1;

    return rng.int(0, 2 ** bits - 1);
  }

  const bits = INTEGER_BITS.get(baseType);

  if (bits) {
    const unsigned = parsed.unsigned || (family === 'sqlserver' && baseType === 'tinyint');
    const max = 2 ** Math.min(bits - (unsigned ? 0 : 1), 53) - 1;
    const min = unsigned ? 0 : -max - 1;
    const value = Math.trunc(numeric);

    if (Number.isSafeInteger(value) && value >= min && value <= max) return value;
    const sampleMax = baseType === 'tinyint' && args[0] === '1' ? 1 : Math.min(max, 999999);

    return rng.int(0, sampleMax);
  }

  if (baseType === 'decimal') return generateDecimalValue(args, numeric, rng);

  if (['float', 'double', 'real'].includes(baseType)) {
    if (args.length === 2) return generateDecimalValue(args, numeric, rng);

    return Number.isFinite(numeric) ? numeric : Number((rng.next() * 999).toFixed(4));
  }

  const declaredLength = Number(args[0] ?? (baseType === 'char' || baseType === 'nchar' ? 1 : NaN));

  const maxLength =
    Number.isSafeInteger(declaredLength) && declaredLength >= 0 ? declaredLength : undefined;
  const value = preferred === undefined ? genRandomString(rng, maxLength) : String(preferred);

  return maxLength === undefined ? value : Array.from(value).slice(0, maxLength).join('');
}

// ── 导出格式 ──────────────────────────────────────────────────────────────────

// Values reaching export formatting are the finite scalar generator domain.
// oxlint-disable anti-slop/no-runtime-typeof
function toStr(value: MockDataValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  return JSON.stringify(value) ?? '';
}

function formatSqlValue(value: MockDataValue): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const str = toStr(value);

  return `'${str.replace(/'/g, "''")}'`;
}
// oxlint-enable anti-slop/no-runtime-typeof

function formatCsvValue(value: MockDataValue): string {
  if (value === null || value === undefined) return '';
  const str = toStr(value);

  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export type MockExportFormat = 'insert-sql' | 'csv' | 'json';

export interface MockDataGeneratorOptions {
  rowCount: number;
  seed?: number | string;
}

export interface MockDataOutput {
  insertSql: string;
  csv: string;
  json: string;
}

export function generateMockData(
  tableName: string,
  schemaName: string,
  fields: NormalizedField[],
  dbType: DatabaseType,
  options: MockDataGeneratorOptions,
): MockDataOutput {
  const { rowCount, seed = 0 } = options;

  // 过滤掉没有字段名的字段
  const validFields = fields.filter((f) => f.name.trim() !== '');

  if (validFields.length === 0) {
    return { insertSql: '', csv: '', json: '[]' };
  }

  const rng = createMockRandom(seed);

  // 生成 rowCount 行数据
  const rows: Array<Record<string, MockDataValue>> = Array.from({ length: rowCount }, (_, i) => {
    const row: Record<string, MockDataValue> = {};

    for (const field of validFields) {
      row[field.name] = generateValueForField(field, i, dbType, rng);
    }

    return row;
  });

  // ── INSERT SQL ──
  const qualifiedTable = schemaName
    ? `${quoteIdentifier(schemaName, dbType)}.${quoteIdentifier(tableName || 'table_name', dbType)}`
    : quoteIdentifier(tableName || 'table_name', dbType);

  const columnList = validFields.map((f) => quoteIdentifier(f.name, dbType)).join(', ');

  const valueLines = rows.map((row) => {
    const vals = validFields.map((f) => formatSqlValue(row[f.name])).join(', ');

    return `  (${vals})`;
  });
  const insertSql = `INSERT INTO ${qualifiedTable} (${columnList})\nVALUES\n${valueLines.join(',\n')};`;

  // ── CSV ──
  const csvHeader = validFields.map((f) => formatCsvValue(f.name)).join(',');
  const csvRows = rows.map((row) => validFields.map((f) => formatCsvValue(row[f.name])).join(','));
  const csv = [csvHeader, ...csvRows].join('\n');

  // ── JSON ──
  const json = JSON.stringify(rows, null, 2);

  return { insertSql, csv, json };
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
