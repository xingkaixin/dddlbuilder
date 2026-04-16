import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eye, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import type { ParsedResult } from '@/utils/SqlParser';
import type { PreviewField } from './types';
import { useTranslation } from 'react-i18next';
import { getNullableLabel } from '@/i18n/fieldEnums';

interface PreviewStepProps {
  parsedResult: ParsedResult;
  previewFields: PreviewField[];
  onFieldChange: (index: number, field: keyof PreviewField, value: string | number) => void;
  onMoveField: (index: number, direction: 'up' | 'down') => void;
  onDeleteField: (index: number) => void;
}

export function PreviewStep({
  parsedResult,
  previewFields,
  onFieldChange,
  onMoveField,
  onDeleteField,
}: PreviewStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-muted p-3 text-sm">
        <Eye className="h-5 w-5" />
        <span>
          {t('importSql.preview.tableName')}:{' '}
          <strong>{parsedResult.tableName || t('importSql.unnamed')}</strong>
        </span>
        {parsedResult.tableComment && (
          <span>
            {t('importSql.preview.tableComment')}: <strong>{parsedResult.tableComment}</strong>
          </span>
        )}
        <span>
          {t('importSql.preview.fieldCount')}: <strong>{previewFields.length}</strong>
        </span>
        <span>
          {t('importSql.preview.indexCount')}: <strong>{parsedResult.indexes.length}</strong>
        </span>
        <span>
          {t('importSql.preview.authCount')}: <strong>{parsedResult.authObjects.length}</strong>
        </span>
      </div>

      {/* 字段列表 */}
      <div className="max-h-[300px] overflow-auto overscroll-contain rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="w-16 px-2 py-2 text-center">{t('importSql.preview.order')}</th>
              <th className="w-16 px-2 py-2 text-center">{t('importSql.preview.order')}</th>
              <th className="px-2 py-2 text-left">{t('importSql.preview.fieldName')}</th>
              <th className="px-2 py-2 text-left">{t('importSql.preview.fieldType')}</th>
              <th className="px-2 py-2 text-center">{t('importSql.preview.nullable')}</th>
              <th className="w-28 px-2 py-2 text-center">{t('importSql.preview.action')}</th>
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
                      onFieldChange(index, 'order', parseInt(e.target.value, 10) || 0)
                    }
                    className="h-7 w-16 text-center"
                    min={1}
                    aria-label={`${t('importSql.preview.order')} #${index + 1}`}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    value={field.fieldName}
                    onChange={(e) => onFieldChange(index, 'fieldName', e.target.value)}
                    className="h-7"
                    aria-label={`${t('importSql.preview.fieldName')} #${index + 1}`}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    value={field.fieldType}
                    onChange={(e) => onFieldChange(index, 'fieldType', e.target.value)}
                    className="h-7"
                    aria-label={`${t('importSql.preview.fieldType')} #${index + 1}`}
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <Select
                    value={field.nullable}
                    onValueChange={(value) => onFieldChange(index, 'nullable', value)}
                  >
                    <SelectTrigger
                      className="h-7 w-16 mx-auto"
                      aria-label={`${t('importSql.preview.nullable')} #${index + 1}`}
                    >
                      <SelectValue placeholder={getNullableLabel(field.nullable, t)} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="是">{t('importSql.preview.yes')}</SelectItem>
                      <SelectItem value="否">{t('importSql.preview.no')}</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onMoveField(index, 'up')}
                      disabled={index === 0}
                      aria-label={`Move up #${index + 1}`}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onMoveField(index, 'down')}
                      disabled={index === previewFields.length - 1}
                      aria-label={`Move down #${index + 1}`}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDeleteField(index)}
                      aria-label={`Delete #${index + 1}`}
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
            {t('importSql.preview.indexDetails', {
              count: parsedResult.indexes.length,
            })}
          </div>
          <div className="max-h-[150px] overflow-auto overscroll-contain">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">{t('importSql.preview.indexName')}</th>
                  <th className="px-3 py-2 text-left">{t('importSql.preview.indexFields')}</th>
                  <th className="px-3 py-2 text-center">{t('importSql.preview.indexType')}</th>
                </tr>
              </thead>
              <tbody>
                {parsedResult.indexes.map((index, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">{index.name}</td>
                    <td className="px-3 py-2">{index.fields.map((f) => f.name).join(', ')}</td>
                    <td className="px-3 py-2 text-center">
                      {index.isPrimary ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                          {t('importSql.preview.primary')}
                        </span>
                      ) : index.unique ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                          {t('importSql.preview.unique')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-slate-700/50 dark:text-slate-200">
                          {t('importSql.preview.normal')}
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

      {/* 授权对象明细 */}
      {parsedResult.authObjects.length > 0 && (
        <div className="rounded-md border">
          <div className="bg-muted px-3 py-2 text-sm font-medium">
            {t('importSql.preview.authDetails', {
              count: parsedResult.authObjects.length,
            })}
          </div>
          <div className="flex flex-wrap gap-2 p-3">
            {parsedResult.authObjects.map((authObject) => (
              <span
                key={authObject}
                className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
              >
                {authObject}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
