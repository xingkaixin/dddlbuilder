export type EnumValueMeta = {
  value: string;
  color?: string;
  i18n?: Record<string, string>;
};

export const FIELD_DEFAULT_KINDS = [
  'none',
  'auto_increment',
  'constant',
  'current_timestamp',
  'uuid',
] as const;

export type FieldDefaultKind = (typeof FIELD_DEFAULT_KINDS)[number];

export const FIELD_ON_UPDATES = ['none', 'current_timestamp'] as const;

export type FieldOnUpdate = (typeof FIELD_ON_UPDATES)[number];

export type FieldRow = {
  order: number;
  fieldName: string;
  fieldType: string;
  fieldComment: string;
  nullable: boolean;
  defaultKind?: FieldDefaultKind;
  defaultValue?: string;
  onUpdate?: FieldOnUpdate;
  enumMeta?: EnumValueMeta[];
};

export type NormalizedField = {
  name: string;
  type: string;
  comment: string;
  nullable: boolean;
  defaultKind: FieldDefaultKind;
  defaultValue: string;
  onUpdate: FieldOnUpdate;
  enumMeta?: EnumValueMeta[];
};

// 归一化的两类输入：历史持久化数据里的中文枚举值，以及模型可能吐出的各种同义写法。
const toToken = (value: unknown): string => {
  if (typeof value === 'string') return value.trim().toLowerCase().replace(/\s+/g, '_');
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
};

// 黑名单而非白名单：未知取值一律按可空处理，与 SQL 里「不写 NOT NULL 即可空」一致。
// 模型可能把非空表述成 not null / notnull，所以两种写法都要收进来。
const NOT_NULLABLE_TOKENS = new Set(['否', 'no', 'n', 'false', '0', 'not_null', 'notnull']);

const DEFAULT_KIND_ALIASES = new Map<string, FieldDefaultKind>([
  ['无', 'none'],
  ['none', 'none'],
  ['自增', 'auto_increment'],
  ['auto_increment', 'auto_increment'],
  ['autoincrement', 'auto_increment'],
  ['identity', 'auto_increment'],
  ['常量', 'constant'],
  ['constant', 'constant'],
  ['const', 'constant'],
  ['literal', 'constant'],
  ['当前时间', 'current_timestamp'],
  ['current_timestamp', 'current_timestamp'],
  ['current_time', 'current_timestamp'],
  ['currenttimestamp', 'current_timestamp'],
  ['now()', 'current_timestamp'],
  ['uuid', 'uuid'],
]);

const ON_UPDATE_ALIASES = new Map<string, FieldOnUpdate>([
  ['无', 'none'],
  ['none', 'none'],
  ['当前时间', 'current_timestamp'],
  ['current_timestamp', 'current_timestamp'],
  ['current_time', 'current_timestamp'],
  ['currenttimestamp', 'current_timestamp'],
  ['now()', 'current_timestamp'],
]);

export const normalizeFieldNullable = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : !NOT_NULLABLE_TOKENS.has(toToken(value));

export const normalizeFieldDefaultKind = (value: unknown): FieldDefaultKind =>
  DEFAULT_KIND_ALIASES.get(toToken(value)) ?? 'none';

export const normalizeFieldOnUpdate = (value: unknown): FieldOnUpdate =>
  ON_UPDATE_ALIASES.get(toToken(value)) ?? 'none';

type FieldEnumValues = {
  nullable: boolean;
  defaultKind?: FieldDefaultKind;
  onUpdate?: FieldOnUpdate;
};

/** 历史持久化数据用中文枚举值，读取时统一转成当前 token；缺失的可选字段保持缺失。 */
export const normalizeFieldEnums = <T extends FieldEnumValues>(field: T): T =>
  ({
    ...field,
    nullable: normalizeFieldNullable(field.nullable),
    ...(field.defaultKind === undefined
      ? {}
      : { defaultKind: normalizeFieldDefaultKind(field.defaultKind) }),
    ...(field.onUpdate === undefined ? {} : { onUpdate: normalizeFieldOnUpdate(field.onUpdate) }),
  }) as T;

export const normalizePersistedRows = <T extends { rows?: FieldRow[] }>(state: T): T =>
  Array.isArray(state?.rows) ? { ...state, rows: state.rows.map(normalizeFieldEnums) } : state;
