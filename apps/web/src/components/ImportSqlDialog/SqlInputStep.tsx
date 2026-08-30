import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle, Download } from '@/components/icons';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { ImportMode, ImportSourceType, ValidationResult } from './types';
import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef } from 'react';

interface SqlInputStepProps {
  selectedDbType: DatabaseType;
  onDbTypeChange: (dbType: DatabaseType) => void;
  sourceType: ImportSourceType;
  onSourceTypeChange: (type: ImportSourceType) => void;
  sql: string;
  onSqlChange: (sql: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  validationResult: ValidationResult | null;
  importMode?: ImportMode;
  onImportModeChange?: (mode: ImportMode) => void;
}

export function SqlInputStep({
  selectedDbType,
  onDbTypeChange,
  sourceType,
  onSourceTypeChange,
  sql,
  onSqlChange,
  file,
  onFileChange,
  validationResult,
  importMode,
  onImportModeChange,
}: SqlInputStepProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!file && fileInputRef.current) fileInputRef.current.value = '';
  });

  const downloadExcelTemplate = async () => {
    const xlsx = await import('xlsx');
    const workbook = xlsx.utils.book_new();
    const usersSheet = xlsx.utils.aoa_to_sheet([
      ['字段名', '字段类型', '字段注释'],
      ['id', 'bigint', '用户 ID'],
      ['name', 'varchar(100)', '用户名'],
      ['email', 'varchar(255)', '邮箱'],
      ['created_at', 'datetime', '创建时间'],
    ]);
    const ordersSheet = xlsx.utils.aoa_to_sheet([
      ['字段名', '字段类型', '字段注释'],
      ['id', 'bigint', '订单 ID'],
      ['user_id', 'bigint', '用户 ID'],
      ['amount', 'decimal(18,2)', '订单金额'],
      ['status', 'varchar(50)', '订单状态'],
    ]);

    xlsx.utils.book_append_sheet(workbook, usersSheet, 'users');
    xlsx.utils.book_append_sheet(workbook, ordersSheet, 'orders');

    const data = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ddlbuilder-import-template.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {importMode && onImportModeChange && (
        <div className="grid gap-2">
          <Label>{t('importSql.mode.label')}</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeRadio
              value="workspace"
              checked={importMode === 'workspace'}
              onChange={onImportModeChange}
              title={t('importSql.mode.workspace')}
              description={t('importSql.mode.workspaceDesc')}
            />
            <ModeRadio
              value="saved"
              checked={importMode === 'saved'}
              onChange={onImportModeChange}
              title={t('importSql.mode.saved')}
              description={t('importSql.mode.savedDesc')}
            />
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="import-source-type">{t('importSql.sourceType.label')}</Label>
          <Select
            value={sourceType}
            onValueChange={(v) => onSourceTypeChange(v as ImportSourceType)}
          >
            <SelectTrigger id="import-source-type">
              <SelectValue placeholder={t('importSql.sourceType.label')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sql">{t('importSql.sourceType.sql')}</SelectItem>
              <SelectItem value="csv">{t('importSql.sourceType.csv')}</SelectItem>
              <SelectItem value="excel">{t('importSql.sourceType.excel')}</SelectItem>
              <SelectItem value="json">{t('importSql.sourceType.json')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="db-type">{t('importSql.sourceDb')}</Label>
          <Select value={selectedDbType} onValueChange={(v) => onDbTypeChange(v as DatabaseType)}>
            <SelectTrigger id="db-type">
              <SelectValue placeholder={t('importSql.selectDbType')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mysql">MySQL</SelectItem>
              <SelectItem value="postgresql">PostgreSQL</SelectItem>
              <SelectItem value="postgresql-citus">PostgreSQL (Citus)</SelectItem>
              <SelectItem value="sqlserver">SQL Server</SelectItem>
              <SelectItem value="oracle">Oracle</SelectItem>
              <SelectItem value="mariadb">MariaDB</SelectItem>
              <SelectItem value="tidb">TiDB</SelectItem>
              <SelectItem value="dm">达梦 (DM)</SelectItem>
              <SelectItem value="oceanbase">OceanBase (MySQL)</SelectItem>
              <SelectItem value="oceanbase-oracle">OceanBase (Oracle)</SelectItem>
              <SelectItem value="kingbase">人大金仓 (Kingbase)</SelectItem>
              <SelectItem value="gbase">南大通用 (GBase)</SelectItem>
              <SelectItem value="polardb">PolarDB</SelectItem>
              <SelectItem value="gaussdb">GaussDB</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {sourceType !== 'sql' && (
        <div className="grid gap-2">
          <Label htmlFor="import-file">{t('importSql.file.label')}</Label>
          {sourceType === 'excel' && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 text-muted-foreground">
                  <p className="font-medium text-foreground">{t('importSql.excelFormat.title')}</p>
                  <p>{t('importSql.excelFormat.sheet')}</p>
                  <p>{t('importSql.excelFormat.columns')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadExcelTemplate()}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {t('importSql.excelFormat.downloadTemplate')}
                </button>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            id="import-file"
            type="file"
            accept={
              sourceType === 'excel'
                ? '.xlsx,.xls'
                : sourceType === 'json'
                  ? '.json'
                  : '.csv,.tsv,.txt'
            }
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
        </div>
      )}
      {sourceType !== 'excel' && (
        <div className="grid gap-2">
          <Label htmlFor="sql-content">
            {sourceType === 'sql' ? t('importSql.sqlContent') : t('importSql.textContent')}
          </Label>
          <textarea
            id="sql-content"
            className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={
              sourceType === 'sql'
                ? 'CREATE TABLE users ( id INT PRIMARY KEY, name VARCHAR(100), ... );'
                : sourceType === 'csv'
                  ? '字段名,字段类型,字段注释\nid,bigint,用户 ID\nname,varchar(100),用户名'
                  : '{ "title": "User", "type": "object", "properties": { "id": { "type": "integer" } } }'
            }
            value={sql}
            onChange={(e) => onSqlChange(e.target.value)}
          />
        </div>
      )}
      {validationResult && (
        <div
          className={`flex items-start gap-2 rounded-md p-3 text-sm ${
            validationResult.success
              ? 'bg-green-50 text-green-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {validationResult.success ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <div>
            {validationResult.success ? (
              <span className="font-medium">{t('importSql.validationPass')}</span>
            ) : (
              <>
                <span className="font-medium">{t('importSql.validationFail')}</span>
                {validationResult.lineNumber && (
                  <span className="ml-2 text-muted-foreground">
                    {t('importSql.lineNo', {
                      line: validationResult.lineNumber,
                    })}
                  </span>
                )}
                <p className="mt-1">{validationResult.error}</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ModeRadio({
  value,
  checked,
  onChange,
  title,
  description,
}: {
  value: ImportMode;
  checked: boolean;
  onChange: (mode: ImportMode) => void;
  title: string;
  description: string;
}) {
  const id = `import-mode-${value}`;
  return (
    <label
      htmlFor={id}
      aria-label={title}
      className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors ${
        checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
      }`}
    >
      <input
        id={id}
        type="radio"
        name="import-mode"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <div className="space-y-0.5">
        <span className="text-sm font-medium">{title}</span>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}
