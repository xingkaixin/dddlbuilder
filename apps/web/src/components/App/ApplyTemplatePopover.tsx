/**
 * 应用模板 Popover 组件
 * 在字段表格上方显示，用于快速应用模板字段
 */

import { memo, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { FileText, ChevronDown, Settings, Plus, Search } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FieldTemplate } from '@/hooks/useFieldTemplates';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui/input';

interface ApplyTemplatePopoverProps {
  templates: FieldTemplate[];
  loading: boolean;
  enableSearch?: boolean;
  maxRecent?: number;
  onApplyTemplate: (template: FieldTemplate) => void;
  onManageTemplates: () => void;
  onSaveAsTemplate: () => void;
}

function includesQuery(value: string | undefined, query: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(query);
}

function matchesTemplate(template: FieldTemplate, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;

  const keywords =
    template.keywords && template.keywords.length > 0 ? template.keywords : [template.name];

  return (
    includesQuery(template.name, normalizedQuery) ||
    includesQuery(template.description, normalizedQuery) ||
    keywords.some((keyword) => includesQuery(keyword, normalizedQuery)) ||
    template.fields.some(
      (field) =>
        includesQuery(field.fieldName, normalizedQuery) ||
        includesQuery(field.fieldComment, normalizedQuery),
    )
  );
}

export const ApplyTemplatePopover = memo<ApplyTemplatePopoverProps>(
  ({
    templates,
    loading,
    enableSearch = true,
    maxRecent = 5,
    onApplyTemplate,
    onManageTemplates,
    onSaveAsTemplate,
  }) => {
    const { t } = useTranslation();
    const trackEvent = useCallback((..._args: unknown[]) => {}, []);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const hasTrackedSearchRef = useRef(false);

    const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

    const sortedTemplates = useMemo(
      () => [...templates].sort((a, b) => b.updatedAt - a.updatedAt),
      [templates],
    );

    const recentTemplates = useMemo(
      () => sortedTemplates.slice(0, Math.max(0, maxRecent)),
      [maxRecent, sortedTemplates],
    );

    const visibleTemplates = useMemo(
      () => sortedTemplates.filter((template) => matchesTemplate(template, normalizedQuery)),
      [normalizedQuery, sortedTemplates],
    );

    const recentTemplateIds = useMemo(
      () => new Set(recentTemplates.map((template) => template.id)),
      [recentTemplates],
    );

    const allTemplatesExceptRecent = useMemo(
      () => visibleTemplates.filter((template) => !recentTemplateIds.has(template.id)),
      [recentTemplateIds, visibleTemplates],
    );

    const handleOpenChange = useCallback((nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        hasTrackedSearchRef.current = false;
        setSearchQuery('');
      }
    }, []);

    const handleApply = useCallback(
      (template: FieldTemplate) => {
        onApplyTemplate(template);
        handleOpenChange(false);
      },
      [handleOpenChange, onApplyTemplate],
    );

    const handleManage = useCallback(() => {
      onManageTemplates();
      handleOpenChange(false);
    }, [handleOpenChange, onManageTemplates]);

    const handleSaveAsTemplate = useCallback(() => {
      onSaveAsTemplate();
      handleOpenChange(false);
    }, [handleOpenChange, onSaveAsTemplate]);

    useEffect(() => {
      if (!enableSearch || !normalizedQuery || hasTrackedSearchRef.current) {
        return;
      }
      hasTrackedSearchRef.current = true;
      trackEvent('template_quick_apply_search_used', {
        queryLength: normalizedQuery.length,
        templateCount: templates.length,
      });
    }, [enableSearch, normalizedQuery, templates.length, trackEvent]);

    const renderTemplateButton = useCallback(
      (template: FieldTemplate) => (
        <button
          key={template.id}
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          onClick={() => handleApply(template)}
        >
          <FileText className="h-4 w-4 shrink-0 text-blue-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{template.name}</div>
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
      ),
      [handleApply, t],
    );

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs font-medium">
            <FileText className="h-3.5 w-3.5" />
            {t('templateManager.quickApply.trigger')}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="border-b p-2">
            <div className="text-sm font-medium">{t('templateManager.quickApply.selectTitle')}</div>
            {enableSearch && (
              <div className="relative mt-2">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('templateManager.quickApply.searchPlaceholder')}
                  className="h-8 pl-7 text-xs"
                  data-testid="quick-apply-search"
                />
              </div>
            )}
          </div>

          <div className="max-h-[240px] overflow-y-auto">
            {loading ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {t('templateManager.quickApply.loading')}
              </div>
            ) : visibleTemplates.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {t('templateManager.quickApply.empty')}
              </div>
            ) : normalizedQuery ? (
              <div className="p-1">
                {visibleTemplates.map((template) => renderTemplateButton(template))}
              </div>
            ) : (
              <div className="p-1">
                {recentTemplates.length > 0 && (
                  <div className="px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">
                    {t('templateManager.quickApply.recentTitle')}
                  </div>
                )}
                {recentTemplates.map((template) => renderTemplateButton(template))}
                {allTemplatesExceptRecent.length > 0 && (
                  <>
                    <div className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
                      {t('templateManager.quickApply.allTitle')}
                    </div>
                    {allTemplatesExceptRecent.map((template) => renderTemplateButton(template))}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-0.5 border-t p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
              onClick={handleSaveAsTemplate}
            >
              <Plus className="h-4 w-4" />
              {t('templateManager.quickApply.saveCurrentAsTemplate')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
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
