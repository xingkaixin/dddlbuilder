import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';
import type { PersistedState } from '@/types';
import { reportError } from './errorReporter';

// Minified types to reduce URL length
type MinifiedFieldRow = {
  n: string; // name
  t: string; // type
  c?: string; // comment
  nu?: 0 | 1; // nullable
  dk?: string; // defaultKind
  dv?: string; // defaultValue
  ou?: string; // onUpdate
};

type MinifiedIndex = {
  n: string; // name
  f: { n: string; d: 0 | 1 }[]; // fields: name, direction (0=ASC, 1=DESC)
  u?: 0 | 1; // unique
  p?: 0 | 1; // primary
};

type MinifiedState = {
  tn: string; // tableName
  tc?: string; // tableComment
  dt: string; // dbType
  r: MinifiedFieldRow[]; // rows
  i?: MinifiedIndex[]; // indexes
  a?: string[]; // authObjects
};

const MAX_COMPRESSED_SHARE_LENGTH = 20_000;
const MAX_DECOMPRESSED_SHARE_LENGTH = 200_000;
const MAX_SHARE_ROWS = 500;
const MAX_SHARE_INDEXES = 200;
const MAX_SHARE_INDEX_FIELDS = 16;
const MAX_SHARE_AUTH_OBJECTS = 200;
const MAX_TABLE_NAME_LENGTH = 128;
const MAX_TABLE_COMMENT_LENGTH = 2_000;
const MAX_FIELD_NAME_LENGTH = 128;
const MAX_FIELD_TYPE_LENGTH = 128;
const MAX_FIELD_COMMENT_LENGTH = 2_000;
const MAX_DEFAULT_KIND_LENGTH = 32;
const MAX_DEFAULT_VALUE_LENGTH = 512;
const MAX_ON_UPDATE_LENGTH = 32;
const MAX_INDEX_NAME_LENGTH = 128;
const MAX_AUTH_OBJECT_LENGTH = 128;

const MINIFIED_STATE_KEYS = new Set(['tn', 'tc', 'dt', 'r', 'i', 'a']);
const MINIFIED_ROW_KEYS = new Set(['n', 't', 'c', 'nu', 'dk', 'dv', 'ou']);
const MINIFIED_INDEX_KEYS = new Set(['n', 'f', 'u', 'p']);
const MINIFIED_INDEX_FIELD_KEYS = new Set(['n', 'd']);
const SUPPORTED_DATABASE_TYPES = new Set<PersistedState['dbType']>([
  'mysql',
  'postgresql',
  'postgresql-citus',
  'sqlserver',
  'oracle',
  'mariadb',
  'tidb',
  'dm',
  'oceanbase',
  'oceanbase-oracle',
  'kingbase',
  'gbase',
  'polardb',
  'gaussdb',
]);

const clipString = (value: string | undefined, maxLength: number): string =>
  (value || '').slice(0, maxLength);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyAllowedKeys = (
  record: Record<string, unknown>,
  allowedKeys: Set<string>,
) => Object.keys(record).every((key) => allowedKeys.has(key));

const isOptionalStringWithin = (
  value: unknown,
  maxLength: number,
): value is string | undefined =>
  value === undefined ||
  (typeof value === 'string' && value.length <= maxLength);

const isMinifiedIndexField = (
  value: unknown,
): value is { n: string; d: 0 | 1 } => {
  if (
    !isRecord(value) ||
    !hasOnlyAllowedKeys(value, MINIFIED_INDEX_FIELD_KEYS)
  ) {
    return false;
  }

  return (
    typeof value.n === 'string' &&
    value.n.length > 0 &&
    value.n.length <= MAX_FIELD_NAME_LENGTH &&
    (value.d === 0 || value.d === 1)
  );
};

const isMinifiedFieldRow = (value: unknown): value is MinifiedFieldRow => {
  if (!isRecord(value) || !hasOnlyAllowedKeys(value, MINIFIED_ROW_KEYS)) {
    return false;
  }

  return (
    typeof value.n === 'string' &&
    value.n.length > 0 &&
    value.n.length <= MAX_FIELD_NAME_LENGTH &&
    typeof value.t === 'string' &&
    value.t.length > 0 &&
    value.t.length <= MAX_FIELD_TYPE_LENGTH &&
    isOptionalStringWithin(value.c, MAX_FIELD_COMMENT_LENGTH) &&
    (value.nu === undefined || value.nu === 0 || value.nu === 1) &&
    isOptionalStringWithin(value.dk, MAX_DEFAULT_KIND_LENGTH) &&
    isOptionalStringWithin(value.dv, MAX_DEFAULT_VALUE_LENGTH) &&
    isOptionalStringWithin(value.ou, MAX_ON_UPDATE_LENGTH)
  );
};

const isMinifiedIndex = (value: unknown): value is MinifiedIndex => {
  if (!isRecord(value) || !hasOnlyAllowedKeys(value, MINIFIED_INDEX_KEYS)) {
    return false;
  }

  return (
    typeof value.n === 'string' &&
    value.n.length > 0 &&
    value.n.length <= MAX_INDEX_NAME_LENGTH &&
    Array.isArray(value.f) &&
    value.f.length > 0 &&
    value.f.length <= MAX_SHARE_INDEX_FIELDS &&
    value.f.every((field) => isMinifiedIndexField(field)) &&
    (value.u === undefined || value.u === 0 || value.u === 1) &&
    (value.p === undefined || value.p === 0 || value.p === 1)
  );
};

const isMinifiedState = (value: unknown): value is MinifiedState => {
  if (!isRecord(value) || !hasOnlyAllowedKeys(value, MINIFIED_STATE_KEYS)) {
    return false;
  }

  const dt = value.dt;
  const rows = value.r;
  const indexes = value.i;
  const authObjects = value.a;

  if (
    typeof value.tn !== 'string' ||
    value.tn.length > MAX_TABLE_NAME_LENGTH ||
    !isOptionalStringWithin(value.tc, MAX_TABLE_COMMENT_LENGTH) ||
    typeof dt !== 'string' ||
    !SUPPORTED_DATABASE_TYPES.has(dt as PersistedState['dbType']) ||
    !Array.isArray(rows) ||
    rows.length > MAX_SHARE_ROWS ||
    !rows.every((row) => isMinifiedFieldRow(row))
  ) {
    return false;
  }

  if (
    indexes !== undefined &&
    (!Array.isArray(indexes) ||
      indexes.length > MAX_SHARE_INDEXES ||
      !indexes.every((idx) => isMinifiedIndex(idx)))
  ) {
    return false;
  }

  if (
    authObjects !== undefined &&
    (!Array.isArray(authObjects) ||
      authObjects.length > MAX_SHARE_AUTH_OBJECTS ||
      !authObjects.every(
        (item) =>
          typeof item === 'string' && item.length <= MAX_AUTH_OBJECT_LENGTH,
      ))
  ) {
    return false;
  }

  return true;
};

export const compressState = (state: Partial<PersistedState>): string => {
  const rows = (state.rows || []).slice(0, MAX_SHARE_ROWS);
  const indexes = (state.indexes || []).slice(0, MAX_SHARE_INDEXES);
  const authObjects =
    state.authObjects && state.authObjects.length > 0
      ? state.authObjects
          .slice(0, MAX_SHARE_AUTH_OBJECTS)
          .map((item) => clipString(item, MAX_AUTH_OBJECT_LENGTH))
      : undefined;

  const dbType = SUPPORTED_DATABASE_TYPES.has(
    state.dbType as PersistedState['dbType'],
  )
    ? (state.dbType as PersistedState['dbType'])
    : 'mysql';

  const minified: MinifiedState = {
    tn: clipString(state.tableName, MAX_TABLE_NAME_LENGTH),
    tc: state.tableComment
      ? clipString(state.tableComment, MAX_TABLE_COMMENT_LENGTH)
      : undefined,
    dt: dbType,
    r: rows.map((row) => ({
      n: clipString(row.fieldName, MAX_FIELD_NAME_LENGTH),
      t: clipString(row.fieldType, MAX_FIELD_TYPE_LENGTH),
      c: row.fieldComment
        ? clipString(row.fieldComment, MAX_FIELD_COMMENT_LENGTH)
        : undefined,
      nu: row.nullable === '是' ? 1 : 0,
      dk:
        row.defaultKind === '无'
          ? undefined
          : clipString(row.defaultKind, MAX_DEFAULT_KIND_LENGTH),
      dv: row.defaultValue
        ? clipString(row.defaultValue, MAX_DEFAULT_VALUE_LENGTH)
        : undefined,
      ou:
        row.onUpdate === '无'
          ? undefined
          : clipString(row.onUpdate, MAX_ON_UPDATE_LENGTH),
    })),
    i: indexes.map((idx) => ({
      n: clipString(idx.name, MAX_INDEX_NAME_LENGTH),
      f: idx.fields.slice(0, MAX_SHARE_INDEX_FIELDS).map((f) => ({
        n: clipString(f.name, MAX_FIELD_NAME_LENGTH),
        d: f.direction === 'ASC' ? 0 : 1,
      })),
      u: idx.unique ? 1 : 0,
      p: idx.isPrimary ? 1 : 0,
    })),
    a: authObjects,
  };

  return compressToEncodedURIComponent(JSON.stringify(minified));
};

export const decompressState = (
  compressed: string,
): Partial<PersistedState> | null => {
  if (!compressed || compressed.length > MAX_COMPRESSED_SHARE_LENGTH) {
    return null;
  }

  try {
    const jsonString = decompressFromEncodedURIComponent(compressed);
    if (!jsonString || jsonString.length > MAX_DECOMPRESSED_SHARE_LENGTH) {
      return null;
    }

    const parsed: unknown = JSON.parse(jsonString);
    if (!isMinifiedState(parsed)) {
      return null;
    }
    const minified = parsed;
    const now = Date.now();

    // Restore to full state
    return {
      tableName: minified.tn,
      tableComment: minified.tc || '',
      dbType: minified.dt as PersistedState['dbType'],
      rows: minified.r.map((r, index) => ({
        order: index + 1,
        fieldName: r.n,
        fieldType: r.t,
        fieldComment: r.c || '',
        nullable: r.nu === 1 ? '是' : '否',
        defaultKind: r.dk || '无',
        defaultValue: r.dv || '',
        onUpdate: r.ou || '无',
      })),
      addCount: 10, // Default
      indexInput: '',
      currentIndexFields: [],
      indexes: (minified.i || []).map((idx, i) => ({
        id: `idx_${now}_${i}`, // Generate new IDs
        name: idx.n,
        fields: idx.f.map((f) => ({
          name: f.n,
          direction: f.d === 0 ? 'ASC' : 'DESC',
        })),
        unique: idx.u === 1,
        isPrimary: idx.p === 1,
      })),
      authInput: '',
      authObjects: minified.a || [],
    };
  } catch (e) {
    reportError(e, {
      scope: 'Share',
      action: 'decompressState',
    });
    return null;
  }
};
