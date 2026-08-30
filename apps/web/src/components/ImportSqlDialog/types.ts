import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import type { SavedTableConflictStrategy } from '@/utils/savedTableBatchImport';
export type { ImportSourceType } from '@/utils/importLimits';

export type ImportMode = 'workspace' | 'saved';

export type ConflictStrategy = SavedTableConflictStrategy;

export type WorkspaceStep = 'validate' | 'preview' | 'confirm';

export type SavedStep = 'validate' | 'select' | 'save';

export interface ValidationResult {
  success: boolean;
  error?: string;
  lineNumber?: number;
}

export type PreviewFieldKey = 'name' | 'type' | 'nullable';

export type ParsedTableItem = ParsedResult & {
  selected: boolean;
  conflict: boolean;
};

export interface FailedItem {
  statement: string;
  error: string;
}
