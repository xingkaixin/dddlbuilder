import type { IndexDefinition, NormalizedField } from '@ddlbuilder/shared-types';

export type DataImportDialect = 'mysql' | 'postgresql';

export type DataDateFormat = 'iso' | 'dmy' | 'mdy';

export interface BusinessData {
  headers: string[];
  rows: { line: number; values: string[] }[];
}

export interface DataImportOptions {
  dateFormat: DataDateFormat;
  trim: boolean;
  emptyAsNull: boolean;
}

export const DEFAULT_DATA_IMPORT_OPTIONS: DataImportOptions = {
  dateFormat: 'iso',
  trim: false,
  emptyAsNull: true,
};

export const BUSINESS_DATA_LIMITS = {
  rows: 5000,
  columns: 100,
  cells: 100000,
  cellCharacters: 10000,
};

export interface DataImportColumn {
  source: string | null;
  name: string;
  type: string;
  nullable: boolean;
}

export interface DataImportTarget {
  dbType: DataImportDialect;
  tableName: string;
  schemaName: string;
  fields: NormalizedField[];
  indexes: IndexDefinition[];
}

export type DataImportIssueCode =
  | 'target'
  | 'name'
  | 'source'
  | 'type'
  | 'required'
  | 'value'
  | 'range'
  | 'length'
  | 'precision'
  | 'enum'
  | 'duplicate'
  | 'nullCharacter';

export interface DataImportIssue {
  line: number;
  field: string;
  value: string;
  code: DataImportIssueCode;
  detail: string;
}

export interface DataImportResult {
  issues: DataImportIssue[];
  sql: string;
  rowCount: number;
  columns: string[];
  preview: (string | null)[][];
}

export function dataImportValue(raw: string, options: DataImportOptions): string | null {
  const value = options.trim ? raw.trim() : raw;

  return options.emptyAsNull && value === '' ? null : value;
}

export function isDataImportName(name: string, dbType: DataImportDialect): boolean {
  return (
    /^[\p{L}_][\p{L}\p{N}_$]*$/u.test(name) &&
    utf8Length(name) <= (dbType === 'postgresql' ? 63 : 64)
  );
}

export function utf8Length(value: string): number {
  return encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, '_').length;
}
