import { AmbiguousTableOverwriteError } from '@/utils/savedTableBatchImport';
import { useReducer, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import { useToast } from '@/hooks/useToast';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { requestSqlParse, requestMultiSqlParse } from '@/services/sqlParseService';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import { parseExcelImport, parseStructuredImportText } from '@/utils/structuredImportParser';
import { ArrowRight, Check } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import type { FolderTreeNode } from '@/hooks/useFolders';
import { normalizeSavedTableName } from '@/utils/savedTablesDb';
import type {
  SavedTableBatchImportRequest,
  SavedTableBatchImportResult,
} from '@/utils/savedTableBatchImport';
import { SqlInputStep } from './SqlInputStep';
import { PreviewStep } from './PreviewStep';
import { ConfirmStep } from './ConfirmStep';
import { TableSelectStep } from './TableSelectStep';
import { SaveConfigStep } from './SaveConfigStep';
import { createImportDialogState, importDialogReducer } from './importDialogState';
import { getImportCharacterLimit, getImportFileByteLimit, toMebibytes } from '@/utils/importLimits';
import type { ImportSourceType, ParsedTableItem, PreviewFieldKey } from './types';

interface ImportSqlDialogProps {
  currentDbType: DatabaseType;
  onImport: (result: ParsedResult, dbType: DatabaseType) => void;
  savedTables?: SavedTableSummary[];
  folderTree?: FolderTreeNode[];
  onBatchImport?: (request: SavedTableBatchImportRequest) => Promise<SavedTableBatchImportResult>;
  onBatchImportComplete?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportSqlDialog({
  currentDbType,
  onImport,
  savedTables,
  folderTree,
  onBatchImport,
  onBatchImportComplete,
  open: isOpen,
  onOpenChange,
}: ImportSqlDialogProps) {
  const sqlParseMutation = useMutation({
    mutationFn: (payload: Parameters<typeof requestSqlParse>[0]) => requestSqlParse(payload),
    retry: false,
  });
  const multiSqlParseMutation = useMutation({
    mutationFn: (payload: Parameters<typeof requestMultiSqlParse>[0]) =>
      requestMultiSqlParse(payload),
    retry: false,
  });
  const { t } = useTranslation();
  const { showToast } = useToast();
  const {
    isPending: isValidating,
    run: runValidation,
    cancel: cancelValidation,
  } = useLatestRequest();

  const batchImportSupported = Boolean(savedTables && folderTree && onBatchImport);

  const [dialogState, dispatch] = useReducer(
    importDialogReducer,
    currentDbType,
    createImportDialogState,
  );
  const { sourceType, sql, file, selectedDbType, validationResult, operation } = dialogState;
  const importMode = dialogState.mode;
  const step = dialogState.step;
  const parsedResult = dialogState.mode === 'workspace' ? dialogState.parsedResult : null;
  const parsedTables = dialogState.mode === 'saved' ? dialogState.parsedTables : [];
  const failedItems = dialogState.mode === 'saved' ? dialogState.failedItems : [];
  const selectedFolderId = dialogState.mode === 'saved' ? dialogState.selectedFolderId : undefined;
  const conflictStrategy = dialogState.mode === 'saved' ? dialogState.conflictStrategy : 'skip';
  const isImporting = operation.kind === 'importing';

  const resetDialog = useCallback(() => {
    cancelValidation();
    dispatch({ type: 'reset', dbType: currentDbType });
  }, [cancelValidation, currentDbType]);

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetDialog();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetDialog],
  );

  const savedTableNames = useMemo(
    () => new Set((savedTables ?? []).map((st) => st.normalizedName)),
    [savedTables],
  );

  const handleSourceTypeChange = useCallback(
    (nextSourceType: ImportSourceType) => {
      cancelValidation();
      dispatch({ type: 'set_source_type', sourceType: nextSourceType });
    },
    [cancelValidation],
  );

  const handleDbTypeChange = useCallback(
    (dbType: DatabaseType) => {
      cancelValidation();
      dispatch({ type: 'set_db_type', dbType });
    },
    [cancelValidation],
  );

  const handleSqlChange = useCallback(
    (nextSql: string) => {
      cancelValidation();
      dispatch({ type: 'set_sql', sql: nextSql });
    },
    [cancelValidation],
  );

  const fileSizeError = useCallback(
    (candidate: File): string | null => {
      const maxBytes = getImportFileByteLimit(sourceType);
      return maxBytes !== null && candidate.size > maxBytes
        ? t('importSql.file.tooLarge', { max: toMebibytes(maxBytes).toLocaleString() })
        : null;
    },
    [sourceType, t],
  );

  const contentLengthError = useCallback(
    (content: string): string | null => {
      const maxCharacters = getImportCharacterLimit(sourceType);
      if (maxCharacters === null || content.length <= maxCharacters) return null;
      return t(sourceType === 'sql' ? 'importSql.sqlTooLong' : 'importSql.contentTooLong', {
        max: maxCharacters.toLocaleString(),
      });
    },
    [sourceType, t],
  );

  const handleFileChange = useCallback(
    (nextFile: File | null) => {
      cancelValidation();
      if (nextFile) {
        const error = fileSizeError(nextFile);
        if (error) {
          dispatch({ type: 'set_file', file: null });
          dispatch({
            type: 'validation_failed',
            result: { success: false, error, lineNumber: 1 },
          });
          return;
        }
      }
      dispatch({ type: 'set_file', file: nextFile });
    },
    [cancelValidation, fileSizeError],
  );

  const buildStructuredTables = useCallback(async (): Promise<ParsedResult[]> => {
    if (sourceType === 'excel') {
      if (!file) throw new Error(t('importSql.file.required'));
      return parseExcelImport(file);
    }

    const content = file ? await file.text() : sql;
    if (file) {
      if (!content.trim()) throw new Error(t('importSql.sqlRequired'));
      const error = contentLengthError(content);
      if (error) throw new Error(error);
    }

    return parseStructuredImportText(
      sourceType === 'json' ? 'json' : 'csv',
      content,
      file?.name ?? 'imported_table',
    );
  }, [contentLengthError, file, sourceType, sql, t]);

  const validateForWorkspace = useCallback(async () => {
    await runValidation(async ({ commitIfCurrent }) => {
      dispatch({ type: 'validation_started' });

      try {
        const result =
          sourceType === 'sql'
            ? await sqlParseMutation.mutateAsync({
                sql: sql.trim(),
                dbType: selectedDbType,
              })
            : (await buildStructuredTables())[0];

        if (!result || (result.fields.length === 0 && result.tableName === '')) {
          commitIfCurrent(() =>
            dispatch({
              type: 'validation_failed',
              result: { success: false, error: t('importSql.sqlNoTable') },
            }),
          );
          return;
        }

        commitIfCurrent(() => dispatch({ type: 'workspace_validated', result }));
      } catch (err) {
        commitIfCurrent(() =>
          dispatch({
            type: 'validation_failed',
            result: {
              success: false,
              error:
                sourceType === 'sql'
                  ? t('importSql.sqlParseFailed')
                  : err instanceof Error
                    ? err.message
                    : t('importSql.sqlParseFailed'),
            },
          }),
        );
      }
    });
  }, [sourceType, sql, selectedDbType, buildStructuredTables, sqlParseMutation, t, runValidation]);

  const validateForSaved = useCallback(async () => {
    await runValidation(async ({ commitIfCurrent }) => {
      dispatch({ type: 'validation_started' });

      try {
        const { results, failed } =
          sourceType === 'sql'
            ? await multiSqlParseMutation.mutateAsync({
                sql: sql.trim(),
                dbType: selectedDbType,
              })
            : { results: await buildStructuredTables(), failed: [] };

        if (results.length === 0) {
          commitIfCurrent(() =>
            dispatch({
              type: 'validation_failed',
              result: { success: false, error: t('importSql.sqlNoTable') },
            }),
          );
          return;
        }

        const items: ParsedTableItem[] = results.map((r: ParsedResult) => ({
          ...r,
          selected: true,
          conflict: savedTableNames.has(normalizeSavedTableName(r.tableName)),
        }));

        commitIfCurrent(() =>
          dispatch({ type: 'saved_validated', tables: items, failedItems: failed }),
        );
      } catch (err) {
        commitIfCurrent(() =>
          dispatch({
            type: 'validation_failed',
            result: {
              success: false,
              error: err instanceof Error ? err.message : t('importSql.sqlParseFailed'),
            },
          }),
        );
      }
    });
  }, [
    sourceType,
    sql,
    selectedDbType,
    buildStructuredTables,
    multiSqlParseMutation,
    savedTableNames,
    t,
    runValidation,
  ]);

  const validateAndAdvance = useCallback(() => {
    const trimmedSql = sql.trim();
    const needsText = sourceType !== 'excel' && !file;
    if (needsText && !trimmedSql) {
      dispatch({
        type: 'validation_failed',
        result: { success: false, error: t('importSql.sqlRequired'), lineNumber: 1 },
      });
      return;
    }
    if (sourceType === 'excel' && !file) {
      dispatch({
        type: 'validation_failed',
        result: { success: false, error: t('importSql.file.required'), lineNumber: 1 },
      });
      return;
    }
    const contentError = !file ? contentLengthError(sql) : null;
    if (contentError) {
      dispatch({
        type: 'validation_failed',
        result: { success: false, error: contentError, lineNumber: 1 },
      });
      return;
    }
    if (importMode === 'saved' && batchImportSupported) {
      void validateForSaved();
      return;
    }
    void validateForWorkspace();
  }, [
    sql,
    sourceType,
    file,
    importMode,
    batchImportSupported,
    validateForSaved,
    validateForWorkspace,
    contentLengthError,
    t,
  ]);

  const handleNext = () => {
    if (step === 'validate') {
      validateAndAdvance();
    } else {
      dispatch({ type: 'advance' });
    }
  };

  const handleBack = () => {
    dispatch({ type: 'back' });
  };

  const handleConfirm = () => {
    if (!parsedResult) return;

    onImport(parsedResult, selectedDbType);
    setOpen(false);
    showToast(
      t('importSql.importSuccess', {
        tableName: parsedResult.tableName || t('importSql.unnamed'),
      }),
    );
  };

  const handleFieldChange = (index: number, field: PreviewFieldKey, value: string | boolean) => {
    dispatch({ type: 'update_preview_field', index, field, value });
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    dispatch({ type: 'move_preview_field', index, direction });
  };

  const deleteField = (index: number) => {
    dispatch({ type: 'delete_preview_field', index });
  };

  const handleToggleSelect = (index: number) => {
    dispatch({ type: 'toggle_table', index });
  };

  const handleSelectAll = () => {
    dispatch({ type: 'select_all_tables', selected: true });
  };

  const handleDeselectAll = () => {
    dispatch({ type: 'select_all_tables', selected: false });
  };

  const selectedTables = useMemo(
    () =>
      dialogState.mode === 'saved'
        ? dialogState.parsedTables.filter((table) => table.selected)
        : [],
    [dialogState],
  );

  const selectedConflictCount = useMemo(
    () => selectedTables.filter((t) => t.conflict).length,
    [selectedTables],
  );

  const handleConfirmBatchImport = async () => {
    if (selectedTables.length === 0) return;
    if (!onBatchImport) return;

    dispatch({ type: 'import_started' });
    let result: SavedTableBatchImportResult;
    try {
      result = await onBatchImport({
        items: selectedTables.map((table) => ({
          name: table.tableName,
          state: convertParsedResultToPersistedState(table, selectedDbType),
        })),
        conflictStrategy,
        folderId: selectedFolderId,
      });
    } catch (error) {
      console.error('[import] batch import failed', error);
      dispatch({
        type: 'import_failed',
        error: t(
          error instanceof AmbiguousTableOverwriteError
            ? 'importSql.batch.ambiguousOverwrite'
            : 'importSql.batch.importFailed',
        ),
      });
      return;
    }
    setOpen(false);
    showToast(
      t('importSql.batch.importResult', {
        success: result.successCount,
        skip: result.skipCount,
        failed: result.failCount,
      }),
    );
    dispatch({ type: 'import_finished' });
    onBatchImportComplete?.();
  };

  const stepDefinitions = useMemo(() => {
    if (importMode === 'saved' && batchImportSupported) {
      return [
        { key: 'validate' as const, label: t('importSql.batch.stepInput') },
        { key: 'select' as const, label: t('importSql.batch.stepSelect') },
        { key: 'save' as const, label: t('importSql.batch.stepSave') },
      ];
    }
    return [
      { key: 'validate' as const, label: t('importSql.stepValidate') },
      { key: 'preview' as const, label: t('importSql.stepPreview') },
      { key: 'confirm' as const, label: t('importSql.stepConfirm') },
    ];
  }, [importMode, batchImportSupported, t]);

  const currentStepIndex = stepDefinitions.findIndex((s) => s.key === step);

  const canGoNext =
    step === 'validate'
      ? (sourceType === 'excel' ? Boolean(file) : Boolean(file || sql.trim())) && !isValidating
      : step === 'select'
        ? selectedTables.length > 0
        : true;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t('importSql.title')}</DialogTitle>
          <DialogDescription>{t('importSql.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2">
            {stepDefinitions.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={`h-0.5 w-8 transition-colors ${
                      currentStepIndex >= i ? 'bg-green-400 dark:bg-emerald-500' : 'bg-border'
                    }`}
                  />
                )}
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    step === s.key
                      ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20'
                      : currentStepIndex > i
                        ? 'border border-green-200 bg-green-100 text-green-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                        : 'bg-muted text-muted-foreground border border-border'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      step === s.key
                        ? 'bg-primary-foreground/20'
                        : currentStepIndex > i
                          ? 'bg-green-500 text-white dark:bg-emerald-500'
                          : 'bg-muted-foreground/20'
                    }`}
                  >
                    {currentStepIndex > i ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 py-4">
          {step === 'validate' && (
            <SqlInputStep
              selectedDbType={selectedDbType}
              onDbTypeChange={handleDbTypeChange}
              sourceType={sourceType}
              onSourceTypeChange={handleSourceTypeChange}
              sql={sql}
              onSqlChange={handleSqlChange}
              file={file}
              onFileChange={handleFileChange}
              validationResult={validationResult}
              importMode={batchImportSupported ? importMode : undefined}
              onImportModeChange={
                batchImportSupported
                  ? (mode) => {
                      cancelValidation();
                      dispatch({ type: 'set_mode', mode });
                    }
                  : undefined
              }
            />
          )}

          {step === 'preview' && parsedResult && (
            <PreviewStep
              parsedResult={parsedResult}
              onFieldChange={handleFieldChange}
              onMoveField={moveField}
              onDeleteField={deleteField}
            />
          )}

          {step === 'confirm' && (
            <ConfirmStep parsedResult={parsedResult} selectedDbType={selectedDbType} />
          )}

          {step === 'select' && (
            <TableSelectStep
              tables={parsedTables}
              failed={failedItems}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
          )}

          {step === 'save' && operation.kind === 'failed' && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {operation.error}
            </p>
          )}
          {step === 'save' && batchImportSupported && (
            <SaveConfigStep
              folders={folderTree ?? []}
              selectedFolderId={selectedFolderId}
              onFolderChange={(folderId) => dispatch({ type: 'set_folder', folderId })}
              conflictStrategy={conflictStrategy}
              onConflictStrategyChange={(strategy) =>
                dispatch({ type: 'set_conflict_strategy', strategy })
              }
              totalCount={selectedTables.length}
              newCount={selectedTables.length - selectedConflictCount}
              conflictCount={selectedConflictCount}
            />
          )}
        </div>

        <DialogFooter>
          {step === 'validate' && (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('importSql.cancel')}
              </Button>
              <Button onClick={handleNext} disabled={!canGoNext}>
                {isValidating ? t('importSql.validating') : t('importSql.next')}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleBack}>
                {t('importSql.previous')}
              </Button>
              <Button onClick={handleNext}>
                {t('importSql.next')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={handleBack}>
                {t('importSql.previous')}
              </Button>
              <Button onClick={handleConfirm}>{t('importSql.confirmImport')}</Button>
            </>
          )}
          {step === 'select' && (
            <>
              <Button variant="outline" onClick={handleBack}>
                {t('importSql.previous')}
              </Button>
              <Button onClick={handleNext} disabled={!canGoNext}>
                {t('importSql.next')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
          {step === 'save' && (
            <>
              <Button variant="outline" onClick={handleBack}>
                {t('importSql.previous')}
              </Button>
              <Button onClick={handleConfirmBatchImport} disabled={isImporting}>
                {isImporting ? t('importSql.batch.importing') : t('importSql.batch.confirmImport')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
