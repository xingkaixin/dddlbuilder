import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import type {
  ConflictStrategy,
  FailedItem,
  ImportMode,
  ImportSourceType,
  ParsedTableItem,
  PreviewField,
  SavedStep,
  ValidationResult,
  WorkspaceStep,
} from './types';

type ImportOperation = 'idle' | 'validating' | 'importing';

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
  previewFields: PreviewField[];
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
  | { type: 'workspace_validated'; result: ParsedResult; fields: PreviewField[] }
  | { type: 'saved_validated'; tables: ParsedTableItem[]; failedItems: FailedItem[] }
  | { type: 'advance' }
  | { type: 'back' }
  | {
      type: 'update_preview_field';
      index: number;
      field: keyof PreviewField;
      value: string | number | boolean;
    }
  | { type: 'move_preview_field'; index: number; direction: 'up' | 'down' }
  | { type: 'delete_preview_field'; index: number }
  | { type: 'toggle_table'; index: number }
  | { type: 'select_all_tables'; selected: boolean }
  | { type: 'set_folder'; folderId: string | undefined }
  | { type: 'set_conflict_strategy'; strategy: ConflictStrategy }
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
    operation: 'idle',
    parsedResult: null,
    previewFields: [],
  };
}

function switchMode(state: ImportDialogState, mode: ImportMode): ImportDialogState {
  const common = {
    sourceType: state.sourceType,
    sql: state.sql,
    file: state.file,
    selectedDbType: state.selectedDbType,
    validationResult: null,
    operation: 'idle' as const,
  };

  return mode === 'workspace'
    ? {
        ...common,
        mode,
        step: 'validate',
        parsedResult: null,
        previewFields: [],
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
      return { ...state, sourceType: action.sourceType, file: null, validationResult: null };
    case 'set_sql':
      return { ...state, sql: action.sql };
    case 'set_file':
      return { ...state, file: action.file };
    case 'set_db_type':
      return { ...state, selectedDbType: action.dbType };
    case 'validation_started':
      return { ...state, operation: 'validating', validationResult: null };
    case 'validation_failed':
      return { ...state, operation: 'idle', validationResult: action.result };
    case 'workspace_validated':
      if (state.mode !== 'workspace') return state;
      return {
        ...state,
        step: 'preview',
        operation: 'idle',
        validationResult: { success: true },
        parsedResult: action.result,
        previewFields: action.fields,
      };
    case 'saved_validated':
      if (state.mode !== 'saved') return state;
      return {
        ...state,
        step: 'select',
        operation: 'idle',
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
      if (state.mode !== 'workspace') return state;
      const currentField = state.previewFields[action.index];
      if (!currentField) return state;
      const previewFields = state.previewFields.slice();
      previewFields[action.index] = {
        ...currentField,
        [action.field]: action.value,
      };
      return { ...state, previewFields };
    }
    case 'move_preview_field': {
      if (state.mode !== 'workspace') return state;
      const targetIndex = action.direction === 'up' ? action.index - 1 : action.index + 1;
      if (targetIndex < 0 || targetIndex >= state.previewFields.length) return state;
      const previewFields = state.previewFields.slice();
      [previewFields[action.index], previewFields[targetIndex]] = [
        previewFields[targetIndex],
        previewFields[action.index],
      ];
      return { ...state, previewFields };
    }
    case 'delete_preview_field':
      if (state.mode !== 'workspace') return state;
      return {
        ...state,
        previewFields: state.previewFields.filter((_, index) => index !== action.index),
      };
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
    case 'import_started':
      return { ...state, operation: 'importing' };
    case 'import_finished':
      return { ...state, operation: 'idle' };
  }
}
