import {
  withDefaultEditorSession,
  type DatabaseType,
  type PersistedState,
} from '@ddlbuilder/shared-types';
import { updateDocumentFields, removeFieldsFromDocument } from '@/stores/editorDocumentMutations';
import { normalizeFields } from '@/utils/helpers';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import type {
  ConflictStrategy,
  FailedItem,
  ImportMode,
  ImportSourceType,
  ParsedTableItem,
  PreviewFieldKey,
  SavedStep,
  ValidationResult,
  WorkspaceStep,
} from './types';

type ImportOperation = { kind: 'idle' | 'importing' } | { kind: 'failed'; error: string };

interface CommonImportState {
  sourceType: ImportSourceType;
  sql: string;
  file: File | null;
  selectedDbType: DatabaseType;
  validationResult: ValidationResult | null;
  operation: ImportOperation;
}

interface WorkspaceImportState extends CommonImportState {
  mode: 'workspace';
  step: WorkspaceStep;
  parsedResult: ParsedResult | null;
}

interface SavedImportState extends CommonImportState {
  mode: 'saved';
  step: SavedStep;
  parsedTables: ParsedTableItem[];
  failedItems: FailedItem[];
  selectedFolderId: string | undefined;
  conflictStrategy: ConflictStrategy;
}

export type ImportDialogState = WorkspaceImportState | SavedImportState;

export type ImportDialogAction =
  | { type: 'reset'; dbType: DatabaseType }
  | { type: 'set_mode'; mode: ImportMode }
  | { type: 'set_source_type'; sourceType: ImportSourceType }
  | { type: 'set_sql'; sql: string }
  | { type: 'set_file'; file: File | null }
  | { type: 'set_db_type'; dbType: DatabaseType }
  | { type: 'validation_started' }
  | { type: 'validation_failed'; result: ValidationResult }
  | { type: 'workspace_validated'; result: ParsedResult }
  | { type: 'saved_validated'; tables: ParsedTableItem[]; failedItems: FailedItem[] }
  | { type: 'advance' }
  | { type: 'back' }
  | {
      type: 'update_preview_field';
      index: number;
      field: PreviewFieldKey;
      value: string | boolean;
    }
  | { type: 'move_preview_field'; index: number; direction: 'up' | 'down' }
  | { type: 'delete_preview_field'; index: number }
  | { type: 'toggle_table'; index: number }
  | { type: 'select_all_tables'; selected: boolean }
  | { type: 'set_folder'; folderId: string | undefined }
  | { type: 'set_conflict_strategy'; strategy: ConflictStrategy }
  | { type: 'import_failed'; error: string }
  | { type: 'import_started' }
  | { type: 'import_finished' };

export function createImportDialogState(dbType: DatabaseType): ImportDialogState {
  return {
    mode: 'workspace',
    step: 'validate',
    sourceType: 'sql',
    sql: '',
    file: null,
    selectedDbType: dbType,
    validationResult: null,
    operation: { kind: 'idle' },
    parsedResult: null,
  };
}

function switchMode(state: ImportDialogState, mode: ImportMode): ImportDialogState {
  const common = {
    sourceType: state.sourceType,
    sql: state.sql,
    file: state.file,
    selectedDbType: state.selectedDbType,
    validationResult: null,
    operation: { kind: 'idle' as const },
  };

  return mode === 'workspace'
    ? {
        ...common,
        mode,
        step: 'validate',
        parsedResult: null,
      }
    : {
        ...common,
        mode,
        step: 'validate',
        parsedTables: [],
        failedItems: [],
        selectedFolderId: undefined,
        conflictStrategy: 'skip',
      };
}

function editPreview(
  state: WorkspaceImportState,
  edit: (document: PersistedState) => PersistedState,
): WorkspaceImportState {
  const result = state.parsedResult;
  if (!result) return state;
  const document = withDefaultEditorSession({
    ...result,
    schemaName: result.schemaName ?? '',
    dbType: state.selectedDbType,
    authInput: '',
    rows: result.fields.map((field, index) => ({
      id: String(index),
      fieldName: field.name,
      fieldType: field.type,
      fieldComment: field.comment,
      nullable: field.nullable,
      defaultKind: field.defaultKind,
      defaultValue: field.defaultValue,
      onUpdate: field.onUpdate,
      enumMeta: field.enumMeta,
    })),
  });
  const next = edit(document);
  return {
    ...state,
    parsedResult: {
      ...result,
      fields: normalizeFields(next.rows),
      indexes: next.indexes,
      foreignKeys: next.foreignKeys ?? [],
      ...(result.mysqlPartitionConfig ? { mysqlPartitionConfig: next.mysqlPartitionConfig } : {}),
      ...(result.tableMiscConfig ? { tableMiscConfig: next.tableMiscConfig } : {}),
    },
  };
}

export function importDialogReducer(
  state: ImportDialogState,
  action: ImportDialogAction,
): ImportDialogState {
  switch (action.type) {
    case 'reset':
      return createImportDialogState(action.dbType);
    case 'set_mode':
      return switchMode(state, action.mode);
    case 'set_source_type':
      return {
        ...state,
        sourceType: action.sourceType,
        sql: '',
        file: null,
        validationResult: null,
      };
    case 'set_sql':
      return { ...state, sql: action.sql, file: null, validationResult: null };
    case 'set_file':
      return { ...state, sql: '', file: action.file, validationResult: null };
    case 'set_db_type':
      return { ...state, selectedDbType: action.dbType };
    case 'validation_started':
      return { ...state, validationResult: null };
    case 'validation_failed':
      return { ...state, validationResult: action.result };
    case 'workspace_validated':
      if (state.mode !== 'workspace') return state;
      return {
        ...state,
        step: 'preview',
        operation: { kind: 'idle' },
        validationResult: { success: true },
        parsedResult: action.result,
      };
    case 'saved_validated':
      if (state.mode !== 'saved') return state;
      return {
        ...state,
        step: 'select',
        operation: { kind: 'idle' },
        validationResult: { success: true },
        parsedTables: action.tables,
        failedItems: action.failedItems,
      };
    case 'advance':
      if (state.mode === 'workspace' && state.step === 'preview') {
        return { ...state, step: 'confirm' };
      }
      if (state.mode === 'saved' && state.step === 'select') {
        return { ...state, step: 'save' };
      }
      return state;
    case 'back':
      if (state.mode === 'workspace') {
        if (state.step === 'confirm') return { ...state, step: 'preview' };
        if (state.step === 'preview') return { ...state, step: 'validate' };
      } else {
        if (state.step === 'save') return { ...state, step: 'select' };
        if (state.step === 'select') return { ...state, step: 'validate' };
      }
      return state;
    case 'update_preview_field': {
      if (state.mode !== 'workspace' || !state.parsedResult?.fields[action.index]) return state;
      const key = { name: 'fieldName', type: 'fieldType', nullable: 'nullable' } as const;
      return editPreview(state, (document) =>
        updateDocumentFields(
          document,
          document.rows.map((row, index) =>
            index === action.index ? { ...row, [key[action.field]]: action.value } : row,
          ),
        ),
      );
    }
    case 'move_preview_field': {
      if (state.mode !== 'workspace' || !state.parsedResult?.fields[action.index]) return state;
      const targetIndex = action.direction === 'up' ? action.index - 1 : action.index + 1;
      const fields = state.parsedResult.fields.slice();
      if (!fields[targetIndex]) return state;
      [fields[action.index], fields[targetIndex]] = [fields[targetIndex], fields[action.index]];
      return { ...state, parsedResult: { ...state.parsedResult, fields } };
    }
    case 'delete_preview_field':
      if (state.mode !== 'workspace' || !state.parsedResult?.fields[action.index]) return state;
      return editPreview(state, (document) =>
        removeFieldsFromDocument(document, (_, index) => index === action.index),
      );
    case 'toggle_table': {
      if (state.mode !== 'saved') return state;
      const currentTable = state.parsedTables[action.index];
      if (!currentTable) return state;
      const parsedTables = state.parsedTables.slice();
      parsedTables[action.index] = {
        ...currentTable,
        selected: !currentTable.selected,
      };
      return { ...state, parsedTables };
    }
    case 'select_all_tables':
      if (state.mode !== 'saved') return state;
      return {
        ...state,
        parsedTables: state.parsedTables.map((table) => ({
          ...table,
          selected: action.selected,
        })),
      };
    case 'set_folder':
      if (state.mode !== 'saved') return state;
      return { ...state, selectedFolderId: action.folderId };
    case 'set_conflict_strategy':
      if (state.mode !== 'saved') return state;
      return { ...state, conflictStrategy: action.strategy };
    case 'import_failed':
      return { ...state, operation: { kind: 'failed', error: action.error } };
    case 'import_started':
      return { ...state, operation: { kind: 'importing' } };
    case 'import_finished':
      return { ...state, operation: { kind: 'idle' } };
  }
}
