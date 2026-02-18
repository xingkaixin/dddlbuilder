import { useEffect, useState, type ReactNode, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import type { DatabaseType } from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';
import { useToast } from '@/hooks/useToast';
import { requestSqlParse } from '@/services/sqlParseService';
import { ArrowRight, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SqlInputStep } from './SqlInputStep';
import { PreviewStep } from './PreviewStep';
import { ConfirmStep } from './ConfirmStep';
import type { PreviewField, ValidationResult } from './types';

type ImportStep = 'validate' | 'preview' | 'confirm';

interface ImportSqlDialogProps {
  currentDbType: DatabaseType;
  onImport: (result: ParsedResult, dbType: DatabaseType) => void;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  triggerLabel?: string;
}

const MAX_SQL_LENGTH = 50_000;

export function ImportSqlDialog({
  currentDbType,
  onImport,
  triggerClassName,
  triggerIcon,
  triggerLabel,
}: ImportSqlDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>('validate');
  const [sql, setSql] = useState('');
  const [selectedDbType, setSelectedDbType] =
    useState<DatabaseType>(currentDbType);
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [previewFields, setPreviewFields] = useState<PreviewField[]>([]);
  const { showToast } = useToast();

  const resolvedTriggerLabel = triggerLabel ?? t('importSql.title');

  useEffect(() => {
    if (!open) {
      setStep('validate');
      setSql('');
      setParsedResult(null);
      setValidationResult(null);
      setPreviewFields([]);
    }
  }, [open]);

  const validateSql = useCallback(async () => {
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      setValidationResult({
        success: false,
        error: t('importSql.sqlRequired'),
        lineNumber: 1,
      });
      return;
    }

    if (trimmedSql.length > MAX_SQL_LENGTH) {
      setValidationResult({
        success: false,
        error: t('importSql.sqlTooLong', {
          max: MAX_SQL_LENGTH.toLocaleString(),
        }),
        lineNumber: 1,
      });
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await requestSqlParse({
        sql: trimmedSql,
        dbType: selectedDbType,
      });

      if (result.fields.length === 0 && result.tableName === '') {
        setValidationResult({
          success: false,
          error: t('importSql.sqlNoTable'),
        });
        setIsValidating(false);
        return;
      }

      setValidationResult({ success: true });
      setParsedResult(result);

      const fields: PreviewField[] = result.fields.map((field, index) => ({
        order: index + 1,
        fieldName: field.name,
        fieldType: field.type,
        fieldComment: field.comment,
        nullable: field.nullable ? '是' : '否',
        defaultKind:
          field.defaultKind === 'none'
            ? '无'
            : field.defaultKind === 'auto_increment'
              ? '自增'
              : field.defaultKind === 'constant'
                ? '常量'
                : field.defaultKind === 'current_timestamp'
                  ? '当前时间'
                  : 'uuid',
        defaultValue: field.defaultValue || '-',
      }));
      setPreviewFields(fields);
      setStep('preview');
    } catch {
      setValidationResult({
        success: false,
        error: t('importSql.sqlParseFailed'),
      });
    } finally {
      setIsValidating(false);
    }
  }, [sql, selectedDbType, t]);

  const handleNext = () => {
    if (step === 'validate') {
      validateSql();
    } else if (step === 'preview') {
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'preview') {
      setStep('validate');
    } else if (step === 'confirm') {
      setStep('preview');
    }
  };

  const handleConfirm = () => {
    if (!parsedResult) return;

    onImport(parsedResult, selectedDbType);
    setOpen(false);
    setSql('');
    setParsedResult(null);
    setValidationResult(null);
    setPreviewFields([]);
    setStep('validate');
    showToast(
      t('importSql.importSuccess', {
        tableName: parsedResult.tableName || t('importSql.unnamed'),
      }),
    );
  };

  const handleFieldChange = (
    index: number,
    field: keyof PreviewField,
    value: string | number,
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
      [newFields[index], newFields[newIndex]] = [
        newFields[newIndex],
        newFields[index],
      ];
      return newFields;
    });
  };

  const deleteField = (index: number) => {
    setPreviewFields((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{t('importSql.title')}</DialogTitle>
          <DialogDescription>{t('importSql.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                step === 'validate'
                  ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20'
                  : step === 'preview' || step === 'confirm'
                    ? 'border border-green-200 bg-green-100 text-green-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  step === 'validate'
                    ? 'bg-primary-foreground/20'
                    : step === 'preview' || step === 'confirm'
                      ? 'bg-green-500 text-white dark:bg-emerald-500'
                      : 'bg-muted-foreground/20'
                }`}
              >
                {step === 'preview' || step === 'confirm' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  '1'
                )}
              </span>
              {t('importSql.stepValidate')}
            </div>
            <div
              className={`h-0.5 w-8 transition-colors ${
                step === 'preview' || step === 'confirm'
                  ? 'bg-green-400 dark:bg-emerald-500'
                  : 'bg-border'
              }`}
            />
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                step === 'preview'
                  ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20'
                  : step === 'confirm'
                    ? 'border border-green-200 bg-green-100 text-green-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  step === 'preview'
                    ? 'bg-primary-foreground/20'
                    : step === 'confirm'
                      ? 'bg-green-500 text-white dark:bg-emerald-500'
                      : 'bg-muted-foreground/20'
                }`}
              >
                {step === 'confirm' ? <Check className="h-3 w-3" /> : '2'}
              </span>
              {t('importSql.stepPreview')}
            </div>
            <div
              className={`h-0.5 w-8 transition-colors ${
                step === 'confirm'
                  ? 'bg-green-400 dark:bg-emerald-500'
                  : 'bg-border'
              }`}
            />
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                step === 'confirm'
                  ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  step === 'confirm'
                    ? 'bg-primary-foreground/20'
                    : 'bg-muted-foreground/20'
                }`}
              >
                3
              </span>
              {t('importSql.stepConfirm')}
            </div>
          </div>
        </div>

        <div className="grid gap-4 py-4">
          {step === 'validate' && (
            <SqlInputStep
              selectedDbType={selectedDbType}
              onDbTypeChange={setSelectedDbType}
              sql={sql}
              onSqlChange={setSql}
              validationResult={validationResult}
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
        </div>

        <DialogFooter>
          {step === 'validate' && (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('importSql.cancel')}
              </Button>
              <Button
                onClick={handleNext}
                disabled={isValidating || !sql.trim()}
              >
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
              <Button onClick={handleConfirm}>
                {t('importSql.confirmImport')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
