import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import { parseFieldType } from '@ddlbuilder/ddl-core';

// ── 本地化数据池 ─────────────────────────────────────────────────────────────

const CN_SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'.split('');
const CN_NAMES_CHARS =
  '伟芳娜秀英敏静艳丽燕珊雪琳倩梅梦娟灿宇子鹏博昊峰磊帆军凯洋鑫浩然志成明亮辉强生'
    .split('');
const CN_CITIES = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安', '南京', '重庆',
  '天津', '苏州', '长沙', '青岛', '郑州', '大连', '东莞', '宁波', '厦门', '合肥',
];
const CN_PROVINCES = [
  '北京市', '天津市', '上海市', '重庆市', '河北省', '山西省', '辽宁省', '吉林省',
  '黑龙江省', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省', '河南省',
  '湖北省', '湖南省', '广东省', '海南省', '四川省', '贵州省', '云南省', '陕西省',
];
const CN_STREET_PREFIXES = ['中山', '解放', '人民', '建设', '和平', '光明', '新华', '学府', '科技', '幸福'];
const CN_STREET_SUFFIXES = ['路', '街', '大道', '巷', '弄'];
const CN_DISTRICTS = ['南山区', '福田区', '罗湖区', '天河区', '海珠区', '越秀区', '朝阳区', '西城区', '浦东新区', '江宁区'];
const EMAIL_DOMAINS = ['gmail.com', '163.com', 'qq.com', 'hotmail.com', '126.com', 'yeah.net', 'sina.com'];
const COMPANY_SUFFIXES = ['科技有限公司', '信息技术有限公司', '软件有限公司', '网络科技有限公司', '数据技术股份有限公司'];
const CN_ADJECTIVES = ['智能', '云端', '数字', '创新', '聚合', '星链', '蓝海', '绿源', '融通', '汇聚'];

// ── 随机工具 ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ── 语义生成函数 ──────────────────────────────────────────────────────────────

function genChineseName(): string {
  const nameLen = Math.random() < 0.3 ? 3 : 2;
  const given = pickN(CN_NAMES_CHARS, nameLen - 1).join('');
  return `${pick(CN_SURNAMES)}${given}`;
}

function genPhone(): string {
  const prefixes = ['130', '131', '132', '133', '135', '136', '137', '138', '139',
    '150', '151', '152', '153', '155', '156', '157', '158', '159',
    '176', '177', '178', '180', '181', '182', '183', '185', '186', '187', '188', '189'];
  return `${pick(prefixes)}${String(randInt(10000000, 99999999))}`;
}

function genEmail(seed?: string): string {
  const localParts = seed
    ? [seed.toLowerCase().replace(/[^a-z0-9]/g, ''), String(randInt(100, 9999))]
    : [String.fromCharCode(...Array.from({ length: randInt(4, 8) }, () => randInt(97, 122))),
      String(randInt(100, 9999))];
  return `${localParts.join('_')}@${pick(EMAIL_DOMAINS)}`;
}

function genAddress(): string {
  return `${pick(CN_PROVINCES).replace(/省|市/, '')}省${pick(CN_CITIES)}市${pick(CN_DISTRICTS)}${pick(CN_STREET_PREFIXES)}${pick(CN_STREET_SUFFIXES)}${randInt(1, 999)}号`;
}

function genCompany(): string {
  return `${pick(CN_ADJECTIVES)}${pick(CN_CITIES)}${pick(COMPANY_SUFFIXES)}`;
}

function genIdCard(): string {
  const year = randInt(1960, 2000);
  const month = String(randInt(1, 12)).padStart(2, '0');
  const day = String(randInt(1, 28)).padStart(2, '0');
  const seq = String(randInt(100, 999));
  const suffix = randInt(0, 9);
  return `4403${String(randInt(10, 99))}${year}${month}${day}${seq}${suffix}`;
}

function genUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function genIp(): string {
  return `${randInt(1, 254)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

function genRandomString(maxLen = 20): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const len = randInt(4, Math.min(maxLen, 20));
  return Array.from({ length: len }, () => pick(chars.split(''))).join('');
}

function genDate(): string {
  const y = randInt(2020, 2025);
  const m = String(randInt(1, 12)).padStart(2, '0');
  const d = String(randInt(1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function genDatetime(): string {
  const date = genDate();
  const h = String(randInt(0, 23)).padStart(2, '0');
  const min = String(randInt(0, 59)).padStart(2, '0');
  const s = String(randInt(0, 59)).padStart(2, '0');
  return `${date} ${h}:${min}:${s}`;
}

function genTime(): string {
  const h = String(randInt(0, 23)).padStart(2, '0');
  const m = String(randInt(0, 59)).padStart(2, '0');
  const s = String(randInt(0, 59)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ── 语义推断 ──────────────────────────────────────────────────────────────────

type SemanticHint =
  | 'chinese_name' | 'phone' | 'email' | 'address' | 'city'
  | 'province' | 'id_card' | 'age' | 'gender_text' | 'gender_num'
  | 'company' | 'uuid' | 'ip' | 'price' | 'status' | 'title'
  | 'description' | 'code' | 'url' | 'avatar' | 'count' | 'year' | null;

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

function generateValueForField(field: NormalizedField, rowIndex: number): unknown {
  // nullable 字段有 10% 概率生成 NULL
  if (field.nullable && field.defaultKind === 'none' && Math.random() < 0.1) {
    return null;
  }

  // defaultKind 处理
  if (field.defaultKind === 'auto_increment') return rowIndex + 1;
  if (field.defaultKind === 'uuid') return genUUID();
  if (field.defaultKind === 'current_timestamp') return genDatetime();

  const parsed = parseFieldType(field.type);
  const baseType = parsed.baseType.toLowerCase();
  const args = parsed.args ?? [];

  const semantic = inferSemanticHint(field.name, field.comment ?? '');

  // ── 按语义优先生成 ──
  if (semantic) {
    switch (semantic) {
      case 'chinese_name': return genChineseName();
      case 'phone': return genPhone();
      case 'email': return genEmail(field.name);
      case 'address': return genAddress();
      case 'city': return pick(CN_CITIES);
      case 'province': return pick(CN_PROVINCES);
      case 'id_card': return genIdCard();
      case 'age': return randInt(18, 75);
      case 'gender_text': return pick(['男', '女']);
      case 'gender_num': return randInt(0, 1);
      case 'company': return genCompany();
      case 'uuid': return genUUID();
      case 'ip': return genIp();
      case 'price': return Number((Math.random() * 9999 + 1).toFixed(2));
      case 'status': return randInt(0, 3);
      case 'title': return `${pick(CN_ADJECTIVES)}${pick(CN_CITIES)}${pick(['项目', '方案', '计划', '报告', '通知'])}`;
      case 'description': return `${pick(CN_CITIES)}${pick(['数字化', '智能化', '信息化'])}建设${pick(['项目', '工程', '方案'])}描述内容`;
      case 'code': return `${String.fromCharCode(randInt(65, 90))}${String(randInt(10000, 99999))}`;
      case 'url': return `https://example.com/${genRandomString(8)}`;
      case 'avatar': return `https://example.com/avatar/${randInt(1, 1000)}.jpg`;
      case 'count': return randInt(0, 9999);
      case 'year': return randInt(2010, 2025);
    }
  }

  // ── 按字段类型生成 ──
  if (baseType === 'enum') {
    // 从 args 中随机选一个，args 如 ["'active'","'inactive'","'pending'"]
    if (args.length > 0) return pick(args).replace(/^'|'$/g, '');
    return 'value';
  }

  if (baseType === 'bool' || baseType === 'boolean') {
    return randInt(0, 1);
  }

  if (baseType === 'bit') {
    const len = args[0] ? parseInt(args[0]) : 1;
    return len === 1 ? randInt(0, 1) : randInt(0, Math.pow(2, len) - 1);
  }

  if (baseType === 'tinyint') {
    // tinyint(1) 通常用作 boolean
    const len = args[0] ? parseInt(args[0]) : undefined;
    return len === 1 ? randInt(0, 1) : randInt(0, 127);
  }

  if (baseType === 'smallint') return randInt(0, 32767);
  if (['int', 'integer', 'mediumint'].includes(baseType)) return randInt(1, 999999);
  if (baseType === 'bigint') return randInt(1000000, 9999999);

  if (['float', 'double', 'real'].includes(baseType)) {
    return Number((Math.random() * 999).toFixed(4));
  }

  if (['decimal', 'numeric'].includes(baseType)) {
    const precision = args[1] ? parseInt(args[1]) : 2;
    return Number((Math.random() * 9999).toFixed(precision));
  }

  if (baseType === 'date') return genDate();
  if (['datetime', 'timestamp'].includes(baseType)) return genDatetime();
  if (baseType === 'time') return genTime();
  if (baseType === 'year') return randInt(2010, 2025);

  if (baseType === 'json') {
    return JSON.stringify({ id: randInt(1, 999), value: genRandomString(6) });
  }

  if (['uuid', 'uniqueidentifier'].includes(baseType)) return genUUID();

  // 字符串类型：varchar, char, text 等
  const maxLen = args[0] ? Math.min(parseInt(args[0]), 50) : 20;
  return genRandomString(maxLen);
}

// ── 导出格式 ──────────────────────────────────────────────────────────────────

function quoteIdentifier(name: string, dbType: DatabaseType): string {
  if (['mysql', 'mariadb', 'tidb', 'oceanbase'].includes(dbType)) return `\`${name}\``;
  if (['sqlserver'].includes(dbType)) return `[${name}]`;
  return `"${name}"`;
}

function toStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  const str = toStr(value);
  return `'${str.replace(/'/g, "''")}'`;
}

function formatCsvValue(value: unknown): string {
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
  const { rowCount } = options;

  // 过滤掉没有字段名的字段
  const validFields = fields.filter((f) => f.name.trim() !== '');
  if (validFields.length === 0) {
    return { insertSql: '-- 暂无有效字段', csv: '', json: '[]' };
  }

  // 生成 rowCount 行数据
  const rows: Record<string, unknown>[] = Array.from({ length: rowCount }, (_, i) => {
    const row: Record<string, unknown> = {};
    for (const field of validFields) {
      row[field.name] = generateValueForField(field, i);
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
  const csvRows = rows.map((row) =>
    validFields.map((f) => formatCsvValue(row[f.name])).join(','),
  );
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
