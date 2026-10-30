import { memo, useCallback, useMemo, useReducer } from 'react';
import { ChevronDown, LayoutTemplate, Plus, Search, Settings } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { TableTemplate } from '@/hooks/useTableTemplates';
import { useTranslation } from 'react-i18next';
import { TableTemplatePreview } from './TableTemplatePreview';

interface TableTemplatePopoverProps {
  templates: TableTemplate[];
  loading: boolean;
  onApplyTemplate: (template: TableTemplate) => void;
  onManageTemplates: () => void;
  onSaveAsTemplate: () => void;
  triggerClassName?: string;
}

function matchesTemplate(template: TableTemplate, query: string): boolean {
  if (!query) return true;

  return (
    template.name.toLowerCase().includes(query) ||
    template.description?.toLowerCase().includes(query) === true ||
    template.blueprint.rows.some(
      (row) =>
        row.fieldName.toLowerCase().includes(query) ||
        row.fieldComment.toLowerCase().includes(query),
    )
  );
}

type PopoverState = {
  open: boolean;
  previewTemplate: TableTemplate | null;
  searchQuery: string;
};

type PopoverEvent =
  | { type: 'openChanged'; open: boolean }
  | { type: 'menuActionChosen' }
  | { type: 'searchChanged'; searchQuery: string }
  | { type: 'previewOpened'; template: TableTemplate }
  | { type: 'previewClosed' }
  | { type: 'templateApplied' };

const initialPopoverState: PopoverState = { open: false, previewTemplate: null, searchQuery: '' };

function popoverReducer(state: PopoverState, event: PopoverEvent): PopoverState {
  switch (event.type) {
    case 'openChanged':
      return event.open ? { ...state, open: true } : { ...state, open: false, searchQuery: '' };
    case 'menuActionChosen':
      return { ...state, open: false };
    case 'searchChanged':
      return { ...state, searchQuery: event.searchQuery };
    case 'previewOpened':
      return { ...state, previewTemplate: event.template };
    case 'previewClosed':
      return { ...state, previewTemplate: null };
    case 'templateApplied':
      return { ...state, open: false, previewTemplate: null };
  }
}

export const TableTemplatePopover = memo<TableTemplatePopoverProps>(
  ({
    templates,
    loading,
    onApplyTemplate,
    onManageTemplates,
    onSaveAsTemplate,
    triggerClassName,
  }) => {
    const { t } = useTranslation();

    const [{ open, previewTemplate, searchQuery }, dispatch] = useReducer(
      popoverReducer,
      initialPopoverState,
    );
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const visibleTemplates = useMemo(
      () =>
        [...templates]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .filter((template) => matchesTemplate(template, normalizedQuery)),
      [normalizedQuery, templates],
    );

    const handleApply = useCallback(
      (template: TableTemplate) => {
        onApplyTemplate(template);
        dispatch({ type: 'templateApplied' });
      },
      [onApplyTemplate],
    );

    const handleOpenChange = useCallback(
      (nextOpen: boolean) => dispatch({ type: 'openChanged', open: nextOpen }),
      [],
    );

    return (
      <>
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={triggerClassName ?? 'h-7 gap-1.5 px-2 text-xs font-medium'}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              {t('tableTemplate.quickApply.trigger')}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <div className="border-b p-2">
              <div className="text-sm font-medium">{t('tableTemplate.quickApply.selectTitle')}</div>
              <div className="relative mt-2">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) =>
                    dispatch({ type: 'searchChanged', searchQuery: event.target.value })
                  }
                  placeholder={t('tableTemplate.quickApply.searchPlaceholder')}
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>

            <div className="max-h-[260px] overflow-y-auto p-1">
              {loading ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t('tableTemplate.loading')}
                </div>
              ) : visibleTemplates.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t('tableTemplate.empty')}
                </div>
              ) : (
                visibleTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => dispatch({ type: 'previewOpened', template })}
                  >
                    <LayoutTemplate className="h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{template.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t('tableTemplate.quickApply.summary', {
                          fields: template.blueprint.rows.length,
                          indexes: template.blueprint.indexes.length,
                        })}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t('tableTemplate.quickApply.preview')}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="flex flex-col gap-0.5 border-t p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
                onClick={() => {
                  onSaveAsTemplate();
                  dispatch({ type: 'menuActionChosen' });
                }}
              >
                <Plus className="h-4 w-4" />
                {t('tableTemplate.quickApply.saveCurrent')}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
                onClick={() => {
                  onManageTemplates();
                  dispatch({ type: 'menuActionChosen' });
                }}
              >
                <Settings className="h-4 w-4" />
                {t('tableTemplate.quickApply.manage')}
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <Dialog
          open={Boolean(previewTemplate)}
          onOpenChange={(nextOpen) => !nextOpen && dispatch({ type: 'previewClosed' })}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{previewTemplate?.name}</DialogTitle>
            </DialogHeader>
            {previewTemplate && <TableTemplatePreview blueprint={previewTemplate.blueprint} />}
            <DialogFooter>
              <Button variant="outline" onClick={() => dispatch({ type: 'previewClosed' })}>
                {t('tableTemplate.preview.cancel')}
              </Button>
              <Button onClick={() => previewTemplate && handleApply(previewTemplate)}>
                {t('tableTemplate.preview.apply')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

TableTemplatePopover.displayName = 'TableTemplatePopover';
