import type { ParsedResult } from '@/utils/SqlParser';

export type ImportMode = 'workspace' | 'saved';

export type ConflictStrategy = 'skip' | 'overwrite' | 'rename';

export type ImportSourceType = 'sql' | 'csv' | 'excel' | 'json';

export type WorkspaceStep = 'validate' | 'preview' | 'confirm';

export type SavedStep = 'validate' | 'select' | 'save';

export interface ValidationResult {
  success: boolean;
  error?: string;
  lineNumber?: number;
}

export interface PreviewField {
  order: number;
  fieldName: string;
  fieldType: string;
  fieldComment: string;
  nullable: string;
  defaultKind: string;
  defaultValue: string;
}

export type ParsedTableItem = ParsedResult & {
  selected: boolean;
  conflict: boolean;
};

export interface FailedItem {
  statement: string;
  error: string;
}
