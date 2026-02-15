/**
 * 字段编辑行组件
 * 用于模板编辑器中的单行字段编辑
 */

import { memo, useCallback } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TemplateField } from '@/hooks/useFieldTemplates';

// 空字段默认值
export const createEmptyField = (): TemplateField => ({
  fieldName: '',
  fieldType: '',
  fieldComment: '',
  nullable: '是',
  defaultKind: '无',
  defaultValue: '',
  onUpdate: '无',
});

interface FieldEditRowProps {
  field: TemplateField;
  index: number;
  total: number;
  onChange: (index: number, field: TemplateField) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
}

export const FieldEditRow = memo<FieldEditRowProps>(
  ({ field, index, total, onChange, onRemove, onMove }) => {
    const handleChange = useCallback(
      (key: keyof TemplateField, value: string) => {
        onChange(index, { ...field, [key]: value });
      },
      [field, index, onChange],
    );

    return (
      <div className="group flex items-center gap-2 rounded-md border bg-background p-2">
        <div className="flex flex-col gap-0.5 items-center shrink-0 w-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 text-muted-foreground disabled:opacity-0"
            disabled={index === 0}
            onClick={() => onMove(index, 'up')}
            aria-label={`上移第${index + 1}个模板字段`}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <span className="text-[10px] text-muted-foreground leading-none">
            {index + 1}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 text-muted-foreground disabled:opacity-0"
            disabled={index === total - 1}
            onClick={() => onMove(index, 'down')}
            aria-label={`下移第${index + 1}个模板字段`}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex-1 grid grid-cols-[1.5fr_1.2fr_1.5fr_80px_1fr_1fr_1fr] gap-2 items-center">
          <Input
            placeholder="字段名"
            value={field.fieldName}
            onChange={(e) => handleChange('fieldName', e.target.value)}
            className="h-8 text-xs font-mono"
            title="字段名"
            aria-label={`第${index + 1}行模板字段名`}
          />
          <Input
            placeholder="类型"
            value={field.fieldType}
            onChange={(e) => handleChange('fieldType', e.target.value)}
            className="h-8 text-xs font-mono"
            title="数据类型"
            aria-label={`第${index + 1}行模板字段类型`}
          />
          <Input
            placeholder="注释"
            value={field.fieldComment || ''}
            onChange={(e) => handleChange('fieldComment', e.target.value)}
            className="h-8 text-xs"
            title="说明文字"
            aria-label={`第${index + 1}行模板字段注释`}
          />
          <Select
            value={field.nullable}
            onValueChange={(value) =>
              handleChange('nullable', value as '是' | '否')
            }
          >
            <SelectTrigger
              className="h-8 text-[11px] px-2 text-center"
              aria-label={`第${index + 1}行模板字段可空设置`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="是">可空</SelectItem>
              <SelectItem value="否">非空</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="默认类型"
            value={field.defaultKind || ''}
            onChange={(e) => handleChange('defaultKind', e.target.value)}
            className="h-8 text-xs"
            title="默认值类型"
            aria-label={`第${index + 1}行模板默认类型`}
          />
          <Input
            placeholder="默认值"
            value={field.defaultValue || ''}
            onChange={(e) => handleChange('defaultValue', e.target.value)}
            className="h-8 text-xs"
            title="默认内容"
            aria-label={`第${index + 1}行模板默认值`}
          />
          <Input
            placeholder="更新时"
            value={field.onUpdate || ''}
            onChange={(e) => handleChange('onUpdate', e.target.value)}
            className="h-8 text-xs"
            title="更新操作"
            aria-label={`第${index + 1}行模板更新动作`}
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
          aria-label={`删除第${index + 1}个模板字段`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  },
);
FieldEditRow.displayName = 'FieldEditRow';
