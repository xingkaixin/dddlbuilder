/**
 * 模板列表项组件
 * 显示单个模板的名称、字段数，以及编辑/复制/删除操作
 */

import { memo } from 'react';
import { Pencil, Trash2, Copy, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';

interface TemplateListItemProps {
  template: FieldTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const TemplateListItem = memo<TemplateListItemProps>(
  ({ template, onEdit, onDuplicate, onDelete }) => {
    return (
      <div className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent">
        <FileText className="h-5 w-5 text-blue-500" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{template.name}</div>
          <div className="text-sm text-muted-foreground">
            {template.fields.length} 个字段
            {template.description && ` · ${template.description}`}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onEdit}
            title="编辑"
            aria-label={`编辑模板 ${template.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDuplicate}
            title="复制"
            aria-label={`复制模板 ${template.name}`}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="删除"
            aria-label={`删除模板 ${template.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  },
);
TemplateListItem.displayName = 'TemplateListItem';
