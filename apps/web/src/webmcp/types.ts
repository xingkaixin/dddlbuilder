import type { PersistedState } from '@ddlbuilder/shared-types';
import type { TableDiff } from '@ddlbuilder/ddl-core';
import type { SchemaLintIssue } from '@/utils/schemaLint';
import type { SchemaPatchOperation } from './schemaPatch';

export type WebMcpAuthStatus = 'loading' | 'signed_out' | 'signed_in';

export type WebMcpChangeSource = 'schema_patch' | 'sql_import';

export interface WebMcpChangeSummary {
  tableChanges: number;
  fieldChanges: number;
  indexChanges: number;
  foreignKeyChanges: number;
  lintErrors: number;
  lintWarnings: number;
}

export interface WebMcpChangeSet {
  id: string;
  source: WebMcpChangeSource;
  baseSignature: string;
  baseState: PersistedState;
  candidateState: PersistedState;
  diff: TableDiff;
  issues: SchemaLintIssue[];
  operations?: SchemaPatchOperation[];
  createdAt: number;
}

export interface WebMcpApplyRequest {
  changeSet: WebMcpChangeSet;
  operationIds?: string[];
}

export interface WebMcpDialogModel {
  request: WebMcpApplyRequest | null;
  mode: 'preview' | 'confirm' | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const summarizeChangeSet = (
  diff: TableDiff,
  issues: SchemaLintIssue[],
): WebMcpChangeSummary => ({
  tableChanges: Number(diff.tableNameChanged) + Number(diff.tableCommentChanged),
  fieldChanges: diff.fields.length,
  indexChanges: diff.indexes.length,
  foreignKeyChanges: diff.foreignKeys.length,
  lintErrors: issues.filter((issue) => issue.severity === 'error').length,
  lintWarnings: issues.filter((issue) => issue.severity === 'warning').length,
});
