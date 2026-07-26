/**
 * 模板列表项组件
 * 显示单个模板的名称、字段数，以及编辑/复制/删除操作
 */

import { memo } from 'react';
import { Pencil, Trash2, Copy, FileText } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import { useTranslation } from 'react-i18next';

interface TemplateListItemProps {
  template: FieldTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const TemplateListItem = memo<TemplateListItemProps>(
  ({ template, onEdit, onDuplicate, onDelete }) => {
    const { t } = useTranslation();

    return (
      <div className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent">
        <FileText className="h-5 w-5 text-blue-500" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{template.name}</div>
          <div className="text-sm text-muted-foreground">
            {t('templateManager.listItem.fieldsCount', {
              count: template.fields.length,
            })}
            {template.description && ` · ${template.description}`}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onEdit}
            title={t('templateManager.listItem.edit')}
            aria-label={t('templateManager.listItem.editAria', {
              name: template.name,
            })}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDuplicate}
            title={t('templateManager.listItem.duplicate')}
            aria-label={t('templateManager.listItem.duplicateAria', {
              name: template.name,
            })}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            title={t('templateManager.listItem.delete')}
            aria-label={t('templateManager.listItem.deleteAria', {
              name: template.name,
            })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  },
);
TemplateListItem.displayName = 'TemplateListItem';
