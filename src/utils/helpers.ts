import type { DatabaseType, FieldRow, UiDefaultKind, UiOnUpdate } from "../types";
import { DEFAULT_KIND_OPTIONS, ON_UPDATE_OPTIONS, YES_VALUES, RESERVED_KEYWORDS } from "./constants";

export const toStringSafe = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  return String(value);
};

export const isReservedKeyword = (db: DatabaseType, name: string) => {
  const lower = toStringSafe(name).trim().toLowerCase();
  if (!lower) return false;
  return RESERVED_KEYWORDS[db]?.has(lower) ?? false;
};

export const normalizeBoolean = (value: string) => {
  if (value == null) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return YES_VALUES.has(normalized);
};

export const normalizeDefaultKind = (
  v: string | undefined
): "none" | "auto_increment" | "constant" | "current_timestamp" | "uuid" => {
  const s = toStringSafe(v).trim();
  if (s === "自增") return "auto_increment";
  if (s === "常量") return "constant";
  if (s === "当前时间") return "current_timestamp";
  if (s === "uuid") return "uuid";
  return "none";
};

export const normalizeOnUpdate = (
  v: string | undefined
): "none" | "current_timestamp" => {
  const s = toStringSafe(v).trim();
  if (s === "当前时间") return "current_timestamp";
  return "none";
};

export const createEmptyRow = (index: number): FieldRow => ({
  order: index + 1,
  fieldName: "",
  fieldType: "",
  fieldComment: "",
  nullable: "是",
  defaultKind: "无",
  defaultValue: "",
  onUpdate: "无",
});

export const ensureOrder = (rows: FieldRow[]) =>
  rows.map((row, index) => ({ ...row, order: index + 1 }));

export const normalizeFields = (rows: FieldRow[]) =>
  rows
    .map((row) => ({
      name: toStringSafe(row.fieldName).trim(),
      type: toStringSafe(row.fieldType).trim(),
      comment: toStringSafe(row.fieldComment).trim(),
      nullable: normalizeBoolean(toStringSafe(row.nullable)),
      defaultKind: normalizeDefaultKind(row.defaultKind as UiDefaultKind),
      defaultValue: toStringSafe(row.defaultValue).trim(),
      onUpdate: normalizeOnUpdate(row.onUpdate as UiOnUpdate),
    }))
    .filter((field) => field.name && field.type);

export const sanitizeRowsForPersist = (rows: FieldRow[]) =>
  ensureOrder(
    rows.map((r, i) => ({
      order: i + 1,
      fieldName: toStringSafe(r.fieldName),
      fieldType: toStringSafe(r.fieldType),
      fieldComment: toStringSafe(r.fieldComment),
      nullable: r?.nullable === "是" ? "是" : "否",
      defaultKind: DEFAULT_KIND_OPTIONS.includes(
        (r?.defaultKind as UiDefaultKind) ?? "无"
      )
        ? (r?.defaultKind as UiDefaultKind)
        : "无",
      defaultValue: toStringSafe(r.defaultValue),
      onUpdate: ON_UPDATE_OPTIONS.includes((r?.onUpdate as UiOnUpdate) ?? "无")
        ? (r?.onUpdate as UiOnUpdate)
        : "无",
    }))
  );

export const isIntegerType = (canonical: string) =>
  new Set(["tinyint", "smallint", "int", "integer", "bigint"]).has(canonical);

export const isCharacterType = (canonical: string) =>
  new Set([
    "char",
    "varchar",
    "text",
    "nchar",
    "nvarchar",
    "longtext",
    "mediumtext",
    "tinytext",
    "clob",
    "varchar2",
    "nvarchar2",
  ]).has(canonical);

export const supportsUuidDefault = (canonical: string) => isCharacterType(canonical);

export const supportsAutoIncrement = (db: DatabaseType, canonical: string) => {
  switch (db) {
    case "mysql":
      return isIntegerType(canonical);
    case "postgresql":
      return new Set(["smallint", "int", "integer", "bigint"]).has(canonical);
    case "sqlserver":
      return new Set(["tinyint", "smallint", "int", "bigint"]).has(canonical);
    case "oracle":
      return new Set(["tinyint", "smallint", "int", "integer", "bigint", "decimal", "number"]).has(canonical);
    default:
      return false;
  }
};

export const supportsDefaultCurrentTimestamp = (
  db: DatabaseType,
  canonical: string
) => {
  switch (db) {
    case "mysql":
      return new Set(["timestamp", "datetime"]).has(canonical);
    case "postgresql":
      return new Set(["timestamp", "timestamptz"]).has(canonical);
    case "sqlserver":
      return new Set(["datetime", "datetime2"]).has(canonical);
    case "oracle":
      return new Set(["timestamp"]).has(canonical);
    default:
      return false;
  }
};

export const supportsOnUpdateCurrentTimestamp = (
  db: DatabaseType,
  canonical: string
) => {
  if (db !== "mysql") return false;
  return new Set(["timestamp", "datetime"]).has(canonical);
};

export const getUiDefaultKindOptions = (
  db: DatabaseType,
  canonical: string
): UiDefaultKind[] => {
  const opts: UiDefaultKind[] = ["无", "常量"];
  if (supportsAutoIncrement(db, canonical)) opts.splice(1, 0, "自增");
  if (supportsUuidDefault(canonical)) opts.push("uuid");
  if (supportsDefaultCurrentTimestamp(db, canonical)) opts.push("当前时间");
  return opts;
};

export const getUiOnUpdateOptions = (
  db: DatabaseType,
  canonical: string
): UiOnUpdate[] => {
  const opts: UiOnUpdate[] = ["无"];
  if (supportsOnUpdateCurrentTimestamp(db, canonical)) opts.push("当前时间");
  return opts;
};