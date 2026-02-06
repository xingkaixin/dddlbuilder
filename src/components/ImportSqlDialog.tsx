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
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { DatabaseType } from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';
import { useToast } from '@/hooks/useToast';
import {
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Eye,
  Trash2,
  Check,
} from 'lucide-react';

type ImportStep = 'validate' | 'preview' | 'confirm';

interface ImportSqlDialogProps {
  currentDbType: DatabaseType;
  onImport: (result: ParsedResult, dbType: DatabaseType) => void;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  triggerLabel?: string;
}

interface ValidationResult {
  success: boolean;
  error?: string;
  lineNumber?: number;
}

interface PreviewField {
  order: number;
  fieldName: string;
  fieldType: string;
  fieldComment: string;
  nullable: string;
  defaultKind: string;
  defaultValue: string;
}

export function ImportSqlDialog({
  currentDbType,
  onImport,
  triggerClassName,
  triggerIcon,
  triggerLabel = '导入 SQL',
}: ImportSqlDialogProps) {
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
    if (!sql.trim()) {
      setValidationResult({
        success: false,
        error: 'SQL 内容不能为空',
        lineNumber: 1,
      });
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const { SqlParser } = await import('@/utils/SqlParser');
      const parser = new SqlParser();
      const result = parser.parse(sql, selectedDbType);

      if (result.fields.length === 0 && result.tableName === '') {
        setValidationResult({
          success: false,
          error: '未能从 SQL 中解析出有效的表结构，请检查 SQL 语法。',
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
    } catch (error: any) {
      setValidationResult({
        success: false,
        error: error.message || '解析失败，请检查 SQL 语法。',
      });
    } finally {
      setIsValidating(false);
    }
  }, [sql, selectedDbType]);

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
    showToast(`导入成功: 成功解析表: ${parsedResult.tableName || '未命名'}`);
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
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName}>
          {triggerIcon}
          <span>{triggerLabel}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>导入 SQL</DialogTitle>
          <DialogDescription>
            粘贴 CREATE TABLE 语句以自动生成表结构配置。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2">
            {/* 步骤 1: 校验 */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                step === 'validate'
                  ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20'
                  : step === 'preview' || step === 'confirm'
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  step === 'validate'
                    ? 'bg-primary-foreground/20'
                    : step === 'preview' || step === 'confirm'
                      ? 'bg-green-500 text-white'
                      : 'bg-muted-foreground/20'
                }`}
              >
                {step === 'preview' || step === 'confirm' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  '1'
                )}
              </span>
              校验
            </div>
            <div
              className={`h-0.5 w-8 transition-colors ${
                step === 'preview' || step === 'confirm'
                  ? 'bg-green-400'
                  : 'bg-border'
              }`}
            />
            {/* 步骤 2: 预览 */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                step === 'preview'
                  ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20'
                  : step === 'confirm'
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  step === 'preview'
                    ? 'bg-primary-foreground/20'
                    : step === 'confirm'
                      ? 'bg-green-500 text-white'
                      : 'bg-muted-foreground/20'
                }`}
              >
                {step === 'confirm' ? <Check className="h-3 w-3" /> : '2'}
              </span>
              预览
            </div>
            <div
              className={`h-0.5 w-8 transition-colors ${
                step === 'confirm' ? 'bg-green-400' : 'bg-border'
              }`}
            />
            {/* 步骤 3: 确认 */}
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
              确认
            </div>
          </div>
        </div>

        <div className="grid gap-4 py-4">
          {step === 'validate' && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="db-type" className="text-right">
                  源数据库
                </Label>
                <Select
                  value={selectedDbType}
                  onValueChange={(v) => setSelectedDbType(v as DatabaseType)}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="选择数据库类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="postgresql-citus">
                      PostgreSQL (Citus)
                    </SelectItem>
                    <SelectItem value="sqlserver">SQL Server</SelectItem>
                    <SelectItem value="oracle">Oracle</SelectItem>
                    <SelectItem value="mariadb">MariaDB</SelectItem>
                    <SelectItem value="tidb">TiDB</SelectItem>
                    <SelectItem value="dm">达梦 (DM)</SelectItem>
                    <SelectItem value="oceanbase">OceanBase (MySQL)</SelectItem>
                    <SelectItem value="oceanbase-oracle">
                      OceanBase (Oracle)
                    </SelectItem>
                    <SelectItem value="kingbase">
                      人大金仓 (Kingbase)
                    </SelectItem>
                    <SelectItem value="gbase">南大通用 (GBase)</SelectItem>
                    <SelectItem value="polardb">PolarDB</SelectItem>
                    <SelectItem value="gaussdb">GaussDB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sql-content">SQL 内容</Label>
                <textarea
                  id="sql-content"
                  className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="CREATE TABLE users ( id INT PRIMARY KEY, name VARCHAR(100), ... );"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                />
              </div>
              {validationResult && (
                <div
                  className={`flex items-start gap-2 rounded-md p-3 text-sm ${
                    validationResult.success
                      ? 'bg-green-50 text-green-700'
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
                      <span className="font-medium">校验通过</span>
                    ) : (
                      <>
                        <span className="font-medium">校验失败</span>
                        {validationResult.lineNumber && (
                          <span className="ml-2 text-muted-foreground">
                            (第 {validationResult.lineNumber} 行)
                          </span>
                        )}
                        <p className="mt-1">{validationResult.error}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'preview' && parsedResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-muted p-3 text-sm">
                <Eye className="h-5 w-5" />
                <span>
                  表名: <strong>{parsedResult.tableName || '未命名'}</strong>
                </span>
                {parsedResult.tableComment && (
                  <span>
                    表中文名: <strong>{parsedResult.tableComment}</strong>
                  </span>
                )}
                <span>
                  字段数: <strong>{previewFields.length}</strong>
                </span>
                <span>
                  索引数: <strong>{parsedResult.indexes.length}</strong>
                </span>
              </div>

              {/* 字段列表 */}
              <div className="max-h-[300px] overflow-auto overscroll-contain rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="w-16 px-2 py-2 text-center">序号</th>
                      <th className="px-2 py-2 text-left">字段名</th>
                      <th className="px-2 py-2 text-left">字段类型</th>
                      <th className="px-2 py-2 text-center">非空</th>
                      <th className="w-28 px-2 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewFields.map((field, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-2 py-2 text-center">
                          <Input
                            type="number"
                            value={field.order}
                            onChange={(e) =>
                              handleFieldChange(
                                index,
                                'order',
                                parseInt(e.target.value, 10) || 0,
                              )
                            }
                            className="h-7 w-16 text-center"
                            min={1}
                            aria-label={`第${index + 1}行字段序号`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            value={field.fieldName}
                            onChange={(e) =>
                              handleFieldChange(
                                index,
                                'fieldName',
                                e.target.value,
                              )
                            }
                            className="h-7"
                            aria-label={`第${index + 1}行字段名`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            value={field.fieldType}
                            onChange={(e) =>
                              handleFieldChange(
                                index,
                                'fieldType',
                                e.target.value,
                              )
                            }
                            className="h-7"
                            aria-label={`第${index + 1}行字段类型`}
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Select
                            value={field.nullable}
                            onValueChange={(value) =>
                              handleFieldChange(index, 'nullable', value)
                            }
                          >
                            <SelectTrigger
                              className="h-7 w-16 mx-auto"
                              aria-label={`第${index + 1}行是否可空`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="是">是</SelectItem>
                              <SelectItem value="否">否</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => moveField(index, 'up')}
                              disabled={index === 0}
                              aria-label={`上移第${index + 1}个字段`}
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => moveField(index, 'down')}
                              disabled={index === previewFields.length - 1}
                              aria-label={`下移第${index + 1}个字段`}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => deleteField(index)}
                              aria-label={`删除第${index + 1}个字段`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 索引明细 */}
              {parsedResult.indexes.length > 0 && (
                <div className="rounded-md border">
                  <div className="bg-muted px-3 py-2 text-sm font-medium">
                    索引明细 ({parsedResult.indexes.length} 个)
                  </div>
                  <div className="max-h-[150px] overflow-auto overscroll-contain">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left">索引名</th>
                          <th className="px-3 py-2 text-left">字段</th>
                          <th className="px-3 py-2 text-center">类型</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedResult.indexes.map((index, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2">{index.name}</td>
                            <td className="px-3 py-2">
                              {index.fields.map((f) => f.name).join(', ')}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {index.isPrimary ? (
                                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                  主键
                                </span>
                              ) : index.unique ? (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                  唯一
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                  普通
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4 text-sm">
                <p className="font-medium">确认导入以下配置？</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
                  <p>
                    表名:{' '}
                    <span className="text-foreground">
                      {parsedResult?.tableName || '未命名'}
                    </span>
                  </p>
                  <p>
                    字段数:{' '}
                    <span className="text-foreground">
                      {previewFields.length}
                    </span>
                  </p>
                  <p>
                    索引数:{' '}
                    <span className="text-foreground">
                      {parsedResult?.indexes.length || 0}
                    </span>
                  </p>
                  <p>
                    数据库:{' '}
                    <span className="text-foreground">{selectedDbType}</span>
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                点击确认后，表结构将导入到当前工作区。
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'validate' && (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                onClick={handleNext}
                disabled={isValidating || !sql.trim()}
              >
                {isValidating ? '校验中...' : '下一步'}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleBack}>
                上一步
              </Button>
              <Button onClick={handleNext}>
                下一步 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={handleBack}>
                上一步
              </Button>
              <Button onClick={handleConfirm}>确认导入</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
