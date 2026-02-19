/**
 * 应用模板 Popover 组件
 * 在字段表格上方显示，用于快速应用模板字段
 */

import { memo, useState, useMemo, useCallback } from 'react';
import { FileText, ChevronDown, Settings, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import { useTranslation } from 'react-i18next';

interface ApplyTemplatePopoverProps {
  templates: FieldTemplate[];
  loading: boolean;
  onApplyTemplate: (template: FieldTemplate) => void;
  onManageTemplates: () => void;
  onSaveAsTemplate: () => void;
}

export const ApplyTemplatePopover = memo<ApplyTemplatePopoverProps>(
  ({
    templates,
    loading,
    onApplyTemplate,
    onManageTemplates,
    onSaveAsTemplate,
  }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    // 按更新时间排序显示最近使用的
    const sortedTemplates = useMemo(
      () =>
        [...templates].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10),
      [templates],
    );

    const handleApply = useCallback(
      (template: FieldTemplate) => {
        onApplyTemplate(template);
        setOpen(false);
      },
      [onApplyTemplate],
    );

    const handleManage = useCallback(() => {
      onManageTemplates();
      setOpen(false);
    }, [onManageTemplates]);

    const handleSaveAsTemplate = useCallback(() => {
      onSaveAsTemplate();
      setOpen(false);
    }, [onSaveAsTemplate]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs font-medium"
          >
            <FileText className="h-3.5 w-3.5" />
            {t('templateManager.quickApply.trigger')}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-2 border-b">
            <div className="text-sm font-medium">
              {t('templateManager.quickApply.selectTitle')}
            </div>
          </div>

          <div className="max-h-[240px] overflow-y-auto">
            {loading ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {t('templateManager.quickApply.loading')}
              </div>
            ) : sortedTemplates.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {t('templateManager.quickApply.empty')}
              </div>
            ) : (
              <div className="p-1">
                {sortedTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left"
                    onClick={() => handleApply(template)}
                  >
                    <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {template.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('templateManager.quickApply.fieldsCount', {
                          count: template.fields.length,
                        })}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t('templateManager.quickApply.apply')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t p-1 flex flex-col gap-0.5">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left text-muted-foreground"
              onClick={handleSaveAsTemplate}
            >
              <Plus className="h-4 w-4" />
              {t('templateManager.quickApply.saveCurrentAsTemplate')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left text-muted-foreground"
              onClick={handleManage}
            >
              <Settings className="h-4 w-4" />
              {t('templateManager.quickApply.manageTemplates')}
            </button>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
ApplyTemplatePopover.displayName = 'ApplyTemplatePopover';
