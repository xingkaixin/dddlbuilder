const MEBIBYTE = 1024 * 1024;

export type ImportSourceType = 'sql' | 'csv' | 'excel' | 'json';

type ImportSourceLimit = {
  maxCharacters: number | null;
  maxFileBytes: number | null;
};

const IMPORT_SOURCE_LIMITS = {
  sql: { maxCharacters: 50_000, maxFileBytes: null },
  csv: { maxCharacters: 200_000, maxFileBytes: MEBIBYTE },
  json: { maxCharacters: 200_000, maxFileBytes: MEBIBYTE },
  excel: { maxCharacters: 200_000, maxFileBytes: 10 * MEBIBYTE },
} satisfies Record<ImportSourceType, ImportSourceLimit>;

export const STRUCTURED_IMPORT_LIMITS = {
  maxTables: 50,
  maxFieldsPerTable: 1_000,
  maxTotalFields: 5_000,
};

export const EXCEL_WORKBOOK_LIMITS = {
  maxSheets: STRUCTURED_IMPORT_LIMITS.maxTables,
  maxFieldsPerSheet: STRUCTURED_IMPORT_LIMITS.maxFieldsPerTable,
  maxColumnsPerSheet: 16,
  maxTotalFields: STRUCTURED_IMPORT_LIMITS.maxTotalFields,
};

export const EXCEL_ARCHIVE_LIMITS = {
  maxEntries: 512,
  maxEntryBytes: 16 * MEBIBYTE,
  maxUncompressedBytes: 64 * MEBIBYTE,
};

export const getImportCharacterLimit = (sourceType: ImportSourceType) =>
  IMPORT_SOURCE_LIMITS[sourceType].maxCharacters;

export const getImportFileByteLimit = (sourceType: ImportSourceType) =>
  IMPORT_SOURCE_LIMITS[sourceType].maxFileBytes;

export const toMebibytes = (bytes: number) => bytes / MEBIBYTE;
