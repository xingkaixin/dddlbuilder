import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { DatabaseType } from '@ddlbuilder/shared-types';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import { useToast } from '@/hooks/useToast';
import { requestMultiSqlParse } from '@/services/sqlParseService';
import { ArrowRight, Check, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SqlInputStep } from '@/components/ImportSqlDialog/SqlInputStep';
import { TableSelectStep } from './TableSelectStep';
import { SaveConfigStep } from './SaveConfigStep';
import type {
  BatchImportSqlDialogProps,
  BatchImportStep,
  ParsedTableItem,
  ConflictStrategy,
} from './types';

const MAX_SQL_LENGTH = 50_000;

export function BatchImportSqlDialog({
  currentDbType,
  savedTables,
  folderTree,
  saveTable,
  overwriteTable,
  moveTableToFolder,
  onImportComplete,
  triggerClassName,
  triggerIcon,
  triggerLabel,
}: BatchImportSqlDialogProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<BatchImportStep>('input');
  const [sql, setSql] = useState('');
  const [selectedDbType, setSelectedDbType] = useState<DatabaseType>(currentDbType);
  const [parsedTables, setParsedTables] = useState<ParsedTableItem[]>([]);
  const [failedItems, setFailedItems] = useState<Array<{ statement: string; error: string }>>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(undefined);
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('skip');
  const [isImporting, setIsImporting] = useState(false);

  const savedTableNames = useMemo(
    () => new Set(savedTables.map((st) => st.normalizedName)),
    [savedTables],
  );

  useEffect(() => {
    if (!open) {
      setStep('input');
      setSql('');
      setParsedTables([]);
      setFailedItems([]);
      setParseError(null);
      setSelectedFolderId(undefined);
      setConflictStrategy('skip');
      setIsImporting(false);
    }
  }, [open]);

  const validateAndParse = useCallback(async () => {
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      setParseError(t('importSql.sqlRequired'));
      return;
    }
    if (trimmedSql.length > MAX_SQL_LENGTH) {
      setParseError(
        t('importSql.sqlTooLong', {
          max: MAX_SQL_LENGTH.toLocaleString(),
        }),
      );
      return;
    }

    setIsParsing(true);
    setParseError(null);

    try {
      const { results, failed } = await requestMultiSqlParse({
        sql: trimmedSql,
        dbType: selectedDbType,
      });

      if (results.length === 0) {
        setParseError(t('importSql.sqlNoTable'));
        setIsParsing(false);
        return;
      }

      const items: ParsedTableItem[] = results.map((r) => ({
        ...r,
        selected: true,
        conflict: savedTableNames.has(r.tableName),
      }));

      setParsedTables(items);
      setFailedItems(failed);
      setStep('select');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t('importSql.sqlParseFailed'));
    } finally {
      setIsParsing(false);
    }
  }, [sql, selectedDbType, savedTableNames, t]);

  const handleNext = () => {
    if (step === 'input') {
      void validateAndParse();
    } else if (step === 'select') {
      setStep('save');
    }
  };

  const handleBack = () => {
    if (step === 'select') {
      setStep('input');
    } else if (step === 'save') {
      setStep('select');
    }
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

  const resolvedTriggerLabel = triggerLabel ?? t('batchImportSql.title');

  const generateUniqueName = useCallback((baseName: string, existingNames: Set<string>): string => {
    let candidate = baseName;
    let suffix = 1;
    while (existingNames.has(candidate)) {
      candidate = `${baseName}_${suffix}`;
      suffix += 1;
    }
    return candidate;
  }, []);

  const handleConfirmImport = async () => {
    if (selectedTables.length === 0) return;

    setIsImporting(true);
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    const currentSavedNames = new Set(savedTables.map((s) => s.normalizedName));

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
      t('batchImportSql.importResult', {
        success: successCount,
        skip: skipCount,
        failed: failCount,
      }),
    );

    onImportComplete();
  };

  const canGoNext =
    step === 'input'
      ? sql.trim().length > 0 && !isParsing
      : step === 'select'
        ? selectedTables.length > 0
        : true;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button type="button" className={triggerClassName}>
              {triggerIcon ?? <Database className="h-4 w-4" aria-hidden />}
              <span>{resolvedTriggerLabel}</span>
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('batchImportSql.triggerTip')}</p>
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t('batchImportSql.title')}</DialogTitle>
          <DialogDescription>{t('batchImportSql.description')}</DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} t={t} />

        <div className="grid gap-4 py-4">
          {step === 'input' && (
            <div className="space-y-4">
              <SqlInputStep
                selectedDbType={selectedDbType}
                onDbTypeChange={setSelectedDbType}
                sql={sql}
                onSqlChange={setSql}
                validationResult={parseError ? { success: false, error: parseError } : null}
              />
            </div>
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

          {step === 'save' && (
            <SaveConfigStep
              folders={folderTree}
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
          {step === 'input' && (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('importSql.cancel')}
              </Button>
              <Button onClick={handleNext} disabled={!canGoNext}>
                {isParsing ? t('importSql.validating') : t('importSql.next')}
              </Button>
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
              <Button onClick={handleConfirmImport} disabled={isImporting}>
                {isImporting ? t('batchImportSql.importing') : t('batchImportSql.confirmImport')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({
  step,
  t,
}: {
  step: BatchImportStep;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const steps: Array<{ key: BatchImportStep; label: string; num: string }> = [
    { key: 'input', label: t('batchImportSql.stepInput'), num: '1' },
    { key: 'select', label: t('batchImportSql.stepSelect'), num: '2' },
    { key: 'save', label: t('batchImportSql.stepSave'), num: '3' },
  ];

  const getStepIndex = (s: BatchImportStep) => steps.findIndex((x) => x.key === s);
  const currentIndex = getStepIndex(step);

  return (
    <div className="flex items-center justify-center py-4">
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-0.5 w-8 transition-colors ${
                  currentIndex >= i ? 'bg-green-400 dark:bg-emerald-500' : 'bg-border'
                }`}
              />
            )}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                step === s.key
                  ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20'
                  : currentIndex > i
                    ? 'border border-green-200 bg-green-100 text-green-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  step === s.key
                    ? 'bg-primary-foreground/20'
                    : currentIndex > i
                      ? 'bg-green-500 text-white dark:bg-emerald-500'
                      : 'bg-muted-foreground/20'
                }`}
              >
                {currentIndex > i ? <Check className="h-3 w-3" /> : s.num}
              </span>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
