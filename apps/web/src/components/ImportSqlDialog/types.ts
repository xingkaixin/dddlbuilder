import type { FieldDefaultKind } from '@ddlbuilder/shared-types';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import type { SavedTableConflictStrategy } from '@/utils/savedTableBatchImport';

export type ImportMode = 'workspace' | 'saved';

export type ConflictStrategy = SavedTableConflictStrategy;

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
  nullable: boolean;
  defaultKind: FieldDefaultKind;
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
