import { useEffect, useState, type ReactNode, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import type { DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import type { ParsedResult } from '@/utils/SqlParser';
import { useToast } from '@/hooks/useToast';
import { requestSqlParse, requestMultiSqlParse } from '@/services/sqlParseService';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import { parseExcelImport, parseStructuredImportText } from '@/utils/structuredImportParser';
import { ArrowRight, Check } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import type { SavedTableSummary, SaveTableResult } from '@/hooks/useSavedTables';
import type { FolderTreeNode } from '@/hooks/useFolders';
import { SqlInputStep } from './SqlInputStep';
import { PreviewStep } from './PreviewStep';
import { ConfirmStep } from './ConfirmStep';
import { TableSelectStep } from './TableSelectStep';
import { SaveConfigStep } from './SaveConfigStep';
import type {
  ImportMode,
  ConflictStrategy,
  ImportSourceType,
  ParsedTableItem,
  PreviewField,
  ValidationResult,
  FailedItem,
} from './types';

type ImportStep = 'validate' | 'preview' | 'confirm' | 'select' | 'save';

interface ImportSqlDialogProps {
  currentDbType: DatabaseType;
  onImport: (result: ParsedResult, dbType: DatabaseType) => void;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  triggerLabel?: string;
  // Optional batch save support. When all callbacks are provided, the dialog
  // exposes a "保存为已保存表" mode in addition to "回填当前工作区".
  savedTables?: SavedTableSummary[];
  folderTree?: FolderTreeNode[];
  saveTable?: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable?: (normalizedName: string, state: PersistedState) => Promise<SaveTableResult>;
  moveTableToFolder?: (normalizedName: string, folderId?: string) => Promise<SaveTableResult>;
  onBatchImportComplete?: () => void;
  // Controlled mode: when provided, the dialog is controlled externally.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // When true, the trigger button is not rendered (useful when the dialog
  // is opened programmatically via the controlled open prop).
  hideTrigger?: boolean;
}

const MAX_SQL_LENGTH = 50_000;
const MAX_TEXT_LENGTH = 200_000;

export function ImportSqlDialog({
  currentDbType,
  onImport,
  triggerClassName,
  triggerIcon,
  triggerLabel,
  savedTables,
  folderTree,
  saveTable,
  overwriteTable,
  moveTableToFolder,
  onBatchImportComplete,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: ImportSqlDialogProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const batchImportSupported = Boolean(
    savedTables && folderTree && saveTable && overwriteTable && moveTableToFolder,
  );

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );
  const [step, setStep] = useState<ImportStep>('validate');
  const [importMode, setImportMode] = useState<ImportMode>('workspace');
  const [sourceType, setSourceType] = useState<ImportSourceType>('sql');
  const [sql, setSql] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedDbType, setSelectedDbType] = useState<DatabaseType>(currentDbType);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Workspace-mode state
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [previewFields, setPreviewFields] = useState<PreviewField[]>([]);

  // Saved-mode state
  const [parsedTables, setParsedTables] = useState<ParsedTableItem[]>([]);
  const [failedItems, setFailedItems] = useState<FailedItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('skip');
  const [isImporting, setIsImporting] = useState(false);

  const resolvedTriggerLabel = triggerLabel ?? t('importSql.title');

  const savedTableNames = useMemo(
    () => new Set((savedTables ?? []).map((st) => st.normalizedName)),
    [savedTables],
  );

  const handleSourceTypeChange = useCallback((nextSourceType: ImportSourceType) => {
    setSourceType(nextSourceType);
    setFile(null);
    setValidationResult(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStep('validate');
      setImportMode('workspace');
      setSourceType('sql');
      setSql('');
      setFile(null);
      setParsedResult(null);
      setValidationResult(null);
      setPreviewFields([]);
      setParsedTables([]);
      setFailedItems([]);
      setSelectedFolderId(undefined);
      setConflictStrategy('skip');
      setIsImporting(false);
    }
  }, [isOpen]);

  const buildStructuredTables = useCallback(async (): Promise<ParsedResult[]> => {
    if (sourceType === 'excel') {
      if (!file) throw new Error(t('importSql.file.required'));
      return parseExcelImport(file);
    }

    const content = file ? await file.text() : sql.trim();
    if (!content.trim()) throw new Error(t('importSql.sqlRequired'));

    return parseStructuredImportText(
      sourceType === 'json' ? 'json' : 'csv',
      content,
      file?.name ?? 'imported_table',
    );
  }, [file, sourceType, sql, t]);

  const buildPreviewFields = useCallback((result: ParsedResult): PreviewField[] => {
    return result.fields.map((field, index) => ({
      order: index + 1,
      fieldName: field.name,
      fieldType: field.type,
      fieldComment: field.comment,
      nullable: field.nullable,
      defaultKind: field.defaultKind,
      defaultValue: field.defaultValue || '-',
    }));
  }, []);

  const validateForWorkspace = useCallback(async () => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      const result =
        sourceType === 'sql'
          ? await requestSqlParse({
              sql: sql.trim(),
              dbType: selectedDbType,
            })
          : (await buildStructuredTables())[0];

      if (!result || (result.fields.length === 0 && result.tableName === '')) {
        setValidationResult({
          success: false,
          error: t('importSql.sqlNoTable'),
        });
        return;
      }

      setValidationResult({ success: true });
      setParsedResult(result);
      setPreviewFields(buildPreviewFields(result));
      setStep('preview');
    } catch (err) {
      setValidationResult({
        success: false,
        error:
          sourceType === 'sql'
            ? t('importSql.sqlParseFailed')
            : err instanceof Error
              ? err.message
              : t('importSql.sqlParseFailed'),
      });
    } finally {
      setIsValidating(false);
    }
  }, [sourceType, sql, selectedDbType, buildStructuredTables, buildPreviewFields, t]);

  const validateForSaved = useCallback(async () => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      const { results, failed } =
        sourceType === 'sql'
          ? await requestMultiSqlParse({
              sql: sql.trim(),
              dbType: selectedDbType,
            })
          : { results: await buildStructuredTables(), failed: [] };

      if (results.length === 0) {
        setValidationResult({
          success: false,
          error: t('importSql.sqlNoTable'),
        });
        return;
      }

      const items: ParsedTableItem[] = results.map((r: ParsedResult) => ({
        ...r,
        selected: true,
        conflict: savedTableNames.has(r.tableName),
      }));

      setParsedTables(items);
      setFailedItems(failed);
      setStep('select');
    } catch (err) {
      setValidationResult({
        success: false,
        error: err instanceof Error ? err.message : t('importSql.sqlParseFailed'),
      });
    } finally {
      setIsValidating(false);
    }
  }, [sourceType, sql, selectedDbType, buildStructuredTables, savedTableNames, t]);

  const validateAndAdvance = useCallback(() => {
    const trimmedSql = sql.trim();
    const needsText = sourceType !== 'excel' && !file;
    if (needsText && !trimmedSql) {
      setValidationResult({
        success: false,
        error: t('importSql.sqlRequired'),
        lineNumber: 1,
      });
      return;
    }
    if (sourceType === 'excel' && !file) {
      setValidationResult({
        success: false,
        error: t('importSql.file.required'),
        lineNumber: 1,
      });
      return;
    }
    const maxLength = sourceType === 'sql' ? MAX_SQL_LENGTH : MAX_TEXT_LENGTH;
    if (trimmedSql.length > maxLength) {
      setValidationResult({
        success: false,
        error: t('importSql.sqlTooLong', {
          max: maxLength.toLocaleString(),
        }),
        lineNumber: 1,
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
    t,
  ]);

  const handleNext = () => {
    if (step === 'validate') {
      validateAndAdvance();
    } else if (step === 'preview') {
      setStep('confirm');
    } else if (step === 'select') {
      setStep('save');
    }
  };

  const handleBack = () => {
    if (step === 'preview' || step === 'select') {
      setStep('validate');
    } else if (step === 'confirm') {
      setStep('preview');
    } else if (step === 'save') {
      setStep('select');
    }
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

  const handleFieldChange = (
    index: number,
    field: keyof PreviewField,
    value: string | number | boolean,
  ) => {
    setPreviewFields((prev) => {
      const newFields = [...prev];
      newFields[index] = { ...newFields[index], [field]: value };
      return newFields;
    });
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= previewFields.length) return;

    setPreviewFields((prev) => {
      const newFields = [...prev];
      [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
      return newFields;
    });
  };

  const deleteField = (index: number) => {
    setPreviewFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleSelect = (index: number) => {
    setParsedTables((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], selected: !next[index].selected };
      return next;
    });
  };

  const handleSelectAll = () => {
    setParsedTables((prev) => prev.map((t) => ({ ...t, selected: true })));
  };

  const handleDeselectAll = () => {
    setParsedTables((prev) => prev.map((t) => ({ ...t, selected: false })));
  };

  const selectedTables = useMemo(() => parsedTables.filter((t) => t.selected), [parsedTables]);

  const selectedConflictCount = useMemo(
    () => selectedTables.filter((t) => t.conflict).length,
    [selectedTables],
  );

  const generateUniqueName = useCallback((baseName: string, existingNames: Set<string>): string => {
    let candidate = baseName;
    let suffix = 1;
    while (existingNames.has(candidate)) {
      candidate = `${baseName}_${suffix}`;
      suffix += 1;
    }
    return candidate;
  }, []);

  const handleConfirmBatchImport = async () => {
    if (selectedTables.length === 0) return;
    if (!saveTable || !overwriteTable || !moveTableToFolder) return;

    setIsImporting(true);
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    const currentSavedNames = new Set((savedTables ?? []).map((s) => s.normalizedName));

    for (const table of selectedTables) {
      const state = convertParsedResultToPersistedState(table, selectedDbType);
      const normalizedName = table.tableName;

      try {
        if (table.conflict) {
          if (conflictStrategy === 'skip') {
            skipCount += 1;
            continue;
          }
          if (conflictStrategy === 'overwrite') {
            const result = await overwriteTable(normalizedName, state);
            if (result.ok) {
              successCount += 1;
              if (selectedFolderId) {
                await moveTableToFolder(normalizedName, selectedFolderId);
              }
            } else {
              failCount += 1;
            }
            continue;
          }
          if (conflictStrategy === 'rename') {
            const newName = generateUniqueName(normalizedName, currentSavedNames);
            currentSavedNames.add(newName);
            const result = await saveTable(newName, state);
            if (result.ok) {
              successCount += 1;
              if (selectedFolderId) {
                await moveTableToFolder(newName, selectedFolderId);
              }
            } else {
              failCount += 1;
            }
            continue;
          }
        }

        const result = await saveTable(normalizedName, state);
        if (result.ok) {
          successCount += 1;
          currentSavedNames.add(normalizedName);
          if (selectedFolderId) {
            await moveTableToFolder(normalizedName, selectedFolderId);
          }
        } else {
          failCount += 1;
        }
      } catch {
        failCount += 1;
      }
    }

    setIsImporting(false);
    setOpen(false);

    showToast(
      t('importSql.batch.importResult', {
        success: successCount,
        skip: skipCount,
        failed: failCount,
      }),
    );

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
      {!hideTrigger && (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button type="button" className={triggerClassName}>
                {triggerIcon}
                <span>{resolvedTriggerLabel}</span>
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('importSql.triggerTip')}</p>
          </TooltipContent>
        </Tooltip>
      )}
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
              onDbTypeChange={setSelectedDbType}
              sourceType={sourceType}
              onSourceTypeChange={handleSourceTypeChange}
              sql={sql}
              onSqlChange={setSql}
              file={file}
              onFileChange={setFile}
              validationResult={validationResult}
              importMode={batchImportSupported ? importMode : undefined}
              onImportModeChange={batchImportSupported ? setImportMode : undefined}
            />
          )}

          {step === 'preview' && parsedResult && (
            <PreviewStep
              parsedResult={parsedResult}
              previewFields={previewFields}
              onFieldChange={handleFieldChange}
              onMoveField={moveField}
              onDeleteField={deleteField}
            />
          )}

          {step === 'confirm' && (
            <ConfirmStep
              parsedResult={parsedResult}
              previewFieldCount={previewFields.length}
              selectedDbType={selectedDbType}
            />
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

          {step === 'save' && batchImportSupported && (
            <SaveConfigStep
              folders={folderTree ?? []}
              selectedFolderId={selectedFolderId}
              onFolderChange={setSelectedFolderId}
              conflictStrategy={conflictStrategy}
              onConflictStrategyChange={setConflictStrategy}
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
