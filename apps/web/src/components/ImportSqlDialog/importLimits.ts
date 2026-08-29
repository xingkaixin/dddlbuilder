import type { ImportSourceType } from './types';

const MEBIBYTE = 1024 * 1024;

type ImportSourceLimit = {
  maxCharacters: number | null;
  maxFileBytes: number | null;
};

const IMPORT_SOURCE_LIMITS = {
  sql: { maxCharacters: 50_000, maxFileBytes: null },
  csv: { maxCharacters: 200_000, maxFileBytes: MEBIBYTE },
  json: { maxCharacters: 200_000, maxFileBytes: MEBIBYTE },
  excel: { maxCharacters: null, maxFileBytes: 10 * MEBIBYTE },
} satisfies Record<ImportSourceType, ImportSourceLimit>;

export const getImportCharacterLimit = (sourceType: ImportSourceType) =>
  IMPORT_SOURCE_LIMITS[sourceType].maxCharacters;

export const getImportFileByteLimit = (sourceType: ImportSourceType) =>
  IMPORT_SOURCE_LIMITS[sourceType].maxFileBytes;

export const toMebibytes = (bytes: number) => bytes / MEBIBYTE;
