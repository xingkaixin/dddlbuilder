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

interface PreviewStepProps {
  parsedResult: ParsedResult;
  previewFields: PreviewField[];
  onFieldChange: (
    index: number,
    field: keyof PreviewField,
    value: string | number,
  ) => void;
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
  return (
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
                      onFieldChange(
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
                      onFieldChange(index, 'fieldName', e.target.value)
                    }
                    className="h-7"
                    aria-label={`第${index + 1}行字段名`}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    value={field.fieldType}
                    onChange={(e) =>
                      onFieldChange(index, 'fieldType', e.target.value)
                    }
                    className="h-7"
                    aria-label={`第${index + 1}行字段类型`}
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <Select
                    value={field.nullable}
                    onValueChange={(value) =>
                      onFieldChange(index, 'nullable', value)
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
                      onClick={() => onMoveField(index, 'up')}
                      disabled={index === 0}
                      aria-label={`上移第${index + 1}个字段`}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onMoveField(index, 'down')}
                      disabled={index === previewFields.length - 1}
                      aria-label={`下移第${index + 1}个字段`}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDeleteField(index)}
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
  );
}
