/**
 * 模板管理对话框组件
 * 提供模板的查看、创建、编辑、删除功能，包含字段编辑器
 */

import { memo, useReducer, useCallback, useMemo, type SetStateAction } from 'react';
import { Plus, Search } from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FieldTemplate, TemplateField } from '@/hooks/useFieldTemplates';
import type { DatabaseType, FieldRow } from '@ddlbuilder/shared-types';
import { createEmptyRow } from '@/utils/helpers';
import { instantiateTemplateFields, toTemplateFields } from '@/utils/fieldTemplates';
import { useEditorStore } from '@/stores';
import { TemplateListItem } from './TemplateListItem';
import { TemplateFieldTable } from './TemplateFieldTable';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';

// 模板管理对话框
interface TemplateManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: FieldTemplate[];
  loading: boolean;
  onCreateTemplate: (
    name: string,
    fields: TemplateField[],
    description?: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  onUpdateTemplate: (
    id: string,
    updates: Partial<Pick<FieldTemplate, 'name' | 'description' | 'fields'>>,
  ) => Promise<{ ok: boolean; message?: string }>;
  onDuplicateTemplate: (id: string, newName?: string) => Promise<{ ok: boolean; message?: string }>;
  onDeleteTemplate: (id: string) => Promise<{ ok: boolean; message?: string }>;
}

type EditStatus = { status: 'idle' } | { status: 'saving' } | { status: 'failed'; error: string };

type ManagerState = {
  searchTerm: string;
  isEditDialogOpen: boolean;
  editingTemplate: FieldTemplate | null;
  editName: string;
  editDescription: string;
  editRows: FieldRow[];
  editStatus: EditStatus;
  isDeleteDialogOpen: boolean;
  deleteTarget: FieldTemplate | null;
};

type ManagerEvent =
  | { type: 'searchChanged'; searchTerm: string }
  | { type: 'editorOpened'; template: FieldTemplate | null; rows: FieldRow[] }
  | { type: 'editDialogOpenChanged'; open: boolean }
  | { type: 'editNameChanged'; name: string }
  | { type: 'editDescriptionChanged'; description: string }
  | { type: 'editRowsChanged'; update: SetStateAction<FieldRow[]> }
  | { type: 'saveStarted' }
  | { type: 'saveFailed'; error: string }
  | { type: 'saved' }
  | { type: 'saveSettled' }
  | { type: 'deleteRequested'; template: FieldTemplate }
  | { type: 'deleteDialogOpenChanged'; open: boolean }
  | { type: 'deleteFinished' };

const idleEditStatus: EditStatus = { status: 'idle' };

const initialManagerState: ManagerState = {
  searchTerm: '',
  isEditDialogOpen: false,
  editingTemplate: null,
  editName: '',
  editDescription: '',
  editRows: [],
  editStatus: idleEditStatus,
  isDeleteDialogOpen: false,
  deleteTarget: null,
};

function managerReducer(state: ManagerState, event: ManagerEvent): ManagerState {
  switch (event.type) {
    case 'searchChanged':
      return { ...state, searchTerm: event.searchTerm };
    case 'editorOpened':
      return {
        ...state,
        isEditDialogOpen: true,
        editingTemplate: event.template,
        editName: event.template?.name ?? '',
        editDescription: event.template?.description || '',
        editRows: event.rows,
        editStatus: idleEditStatus,
      };
    case 'editDialogOpenChanged':
      return { ...state, isEditDialogOpen: event.open };
    case 'editNameChanged':
      return {
        ...state,
        editName: event.name,
        editStatus: state.editStatus.status === 'failed' ? idleEditStatus : state.editStatus,
      };
    case 'editDescriptionChanged':
      return { ...state, editDescription: event.description };
    case 'editRowsChanged':
      return {
        ...state,
        editRows: Array.isArray(event.update) ? event.update : event.update(state.editRows),
      };
    case 'saveStarted':
      return { ...state, editStatus: { status: 'saving' } };
    case 'saveFailed':
      return { ...state, editStatus: { status: 'failed', error: event.error } };
    case 'saved':
      return { ...state, isEditDialogOpen: false, editingTemplate: null };
    case 'saveSettled':
      return state.editStatus.status === 'saving'
        ? { ...state, editStatus: idleEditStatus }
        : state;
    case 'deleteRequested':
      return { ...state, deleteTarget: event.template, isDeleteDialogOpen: true };
    case 'deleteDialogOpenChanged':
      return { ...state, isDeleteDialogOpen: event.open };
    case 'deleteFinished':
      return { ...state, isDeleteDialogOpen: false, deleteTarget: null };
  }
}

export const TemplateManagerDialog = memo<TemplateManagerDialogProps>(
  ({
    open,
    onOpenChange,
    templates,
    loading,
    onCreateTemplate,
    onUpdateTemplate,
    onDuplicateTemplate,
    onDeleteTemplate,
  }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    // SAFETY: the template editor value is supplied by the typed field-row editor.
    const dbType = useEditorStore((state) => state.dbType) as DatabaseType;

    const [
      {
        searchTerm,
        isEditDialogOpen,
        editingTemplate,
        editName,
        editDescription,
        editRows,
        editStatus,
        isDeleteDialogOpen,
        deleteTarget,
      },
      dispatch,
    ] = useReducer(managerReducer, initialManagerState);
    const isSaving = editStatus.status === 'saving';
    const editError = editStatus.status === 'failed' ? editStatus.error : '';

    // 过滤模板
    const filteredTemplates = useMemo(() => {
      if (!searchTerm.trim()) return templates;
      const term = searchTerm.toLowerCase();

      return templates.filter(
        (t) => t.name.toLowerCase().includes(term) || t.description?.toLowerCase().includes(term),
      );
    }, [templates, searchTerm]);

    // 打开新建/编辑对话框
    const handleOpenEditDialog = useCallback((template?: FieldTemplate) => {
      // 新建时提供一个空字段
      const rows = template?.fields.length
        ? instantiateTemplateFields(template.fields)
        : [createEmptyRow()];

      dispatch({ type: 'editorOpened', template: template ?? null, rows });
    }, []);

    const setEditRows = useCallback(
      (update: SetStateAction<FieldRow[]>) => dispatch({ type: 'editRowsChanged', update }),
      [],
    );

    // 添加字段
    const handleAddField = useCallback(() => {
      const row = createEmptyRow();

      setEditRows((prev) => [...prev, row]);
    }, [setEditRows]);

    // 保存模板
    const handleSaveTemplate = useCallback(async () => {
      const trimmedName = editName.trim();

      if (!trimmedName) {
        dispatch({ type: 'saveFailed', error: t('templateManager.editor.nameRequired') });

        return;
      }

      const validFields = toTemplateFields(editRows);

      dispatch({ type: 'saveStarted' });

      try {
        let result: { ok: boolean; message?: string };

        if (editingTemplate) {
          result = await onUpdateTemplate(editingTemplate.id, {
            name: trimmedName,
            description: editDescription.trim() || undefined,
            fields: validFields,
          });
        } else {
          result = await onCreateTemplate(
            trimmedName,
            validFields,
            editDescription.trim() || undefined,
          );
        }

        if (result.ok) {
          dispatch({ type: 'saved' });
          showToast(
            editingTemplate
              ? t('templateManager.toast.updated', { name: trimmedName })
              : t('templateManager.toast.created', { name: trimmedName }),
          );
        } else {
          dispatch({ type: 'saveFailed', error: t('templateManager.toast.saveFailed') });
          showToast(result.message ?? t('templateManager.toast.saveFailedRetry'));
        }
      } finally {
        dispatch({ type: 'saveSettled' });
      }
    }, [
      t,
      editName,
      editDescription,
      editRows,
      editingTemplate,
      onUpdateTemplate,
      onCreateTemplate,
      showToast,
    ]);

    // 复制模板
    const handleDuplicate = useCallback(
      async (template: FieldTemplate) => {
        const result = await onDuplicateTemplate(template.id);

        if (result.ok) {
          showToast(t('templateManager.toast.duplicated', { name: template.name }));
        } else {
          showToast(result.message ?? t('templateManager.toast.duplicateFailed'));
        }
      },
      [onDuplicateTemplate, showToast, t],
    );

    // 打开删除确认
    const handleOpenDeleteDialog = useCallback(
      (template: FieldTemplate) => dispatch({ type: 'deleteRequested', template }),
      [],
    );

    // 确认删除
    const handleConfirmDelete = useCallback(async () => {
      if (!deleteTarget) return;
      const result = await onDeleteTemplate(deleteTarget.id);

      if (result.ok) {
        showToast(t('templateManager.toast.deleted', { name: deleteTarget.name }));
      } else {
        showToast(result.message ?? t('templateManager.toast.deleteFailed'));
      }

      dispatch({ type: 'deleteFinished' });
    }, [deleteTarget, onDeleteTemplate, showToast, t]);

    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{t('templateManager.title')}</DialogTitle>
              <DialogDescription className="sr-only">
                {t('templateManager.description')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* 搜索和新建 */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t('templateManager.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) =>
                      dispatch({ type: 'searchChanged', searchTerm: e.target.value })
                    }
                    className="pl-8"
                  />
                </div>
                <Button onClick={() => handleOpenEditDialog()}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t('templateManager.create')}
                </Button>
              </div>

              {/* 模板列表 */}
              <div className="max-h-[400px] space-y-2 overflow-y-auto">
                {loading ? (
                  <div className="py-8 text-center text-muted-foreground">
                    {t('templateManager.loading')}
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    {searchTerm ? t('templateManager.emptyFiltered') : t('templateManager.empty')}
                  </div>
                ) : (
                  filteredTemplates.map((template) => (
                    <TemplateListItem
                      key={template.id}
                      template={template}
                      onEdit={() => handleOpenEditDialog(template)}
                      onDuplicate={() => handleDuplicate(template)}
                      onDelete={() => handleOpenDeleteDialog(template)}
                    />
                  ))
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('templateManager.close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新建/编辑对话框 - 包含字段编辑器 */}
        <Dialog
          open={isEditDialogOpen}
          onOpenChange={(open) => dispatch({ type: 'editDialogOpenChanged', open })}
        >
          <DialogContent className="sm:max-w-[90vw] md:max-w-4xl lg:max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate
                  ? t('templateManager.editor.editTitle')
                  : t('templateManager.editor.createTitle')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {editingTemplate
                  ? t('templateManager.editor.editDescription')
                  : t('templateManager.editor.createDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-4 min-h-0">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="template-name">{t('templateManager.editor.name')}</Label>
                  <Input
                    id="template-name"
                    value={editName}
                    onChange={(e) => dispatch({ type: 'editNameChanged', name: e.target.value })}
                    placeholder={t('templateManager.editor.namePlaceholder')}
                    autoFocus
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="template-desc">
                    {t('templateManager.editor.descriptionLabel')}
                  </Label>
                  <Input
                    id="template-desc"
                    value={editDescription}
                    onChange={(e) =>
                      dispatch({ type: 'editDescriptionChanged', description: e.target.value })
                    }
                    placeholder={t('templateManager.editor.descriptionPlaceholder')}
                  />
                </div>
              </div>

              {/* 字段编辑区 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('templateManager.editor.fieldList')}</Label>
                  <Button variant="outline" size="sm" onClick={handleAddField} className="h-7">
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t('templateManager.editor.addField')}
                  </Button>
                </div>

                <TemplateFieldTable rows={editRows} setRows={setEditRows} dbType={dbType} />
              </div>

              {editError && <p className="text-sm text-destructive">{editError}</p>}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => dispatch({ type: 'editDialogOpenChanged', open: false })}
              >
                {t('templateManager.editor.cancel')}
              </Button>
              <Button onClick={handleSaveTemplate} disabled={isSaving}>
                {isSaving
                  ? t('templateManager.editor.saving')
                  : editingTemplate
                    ? t('templateManager.editor.save')
                    : t('templateManager.editor.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 删除确认 */}
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={(open) => dispatch({ type: 'deleteDialogOpenChanged', open })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('templateManager.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('templateManager.delete.description', {
                  name: deleteTarget?.name || '',
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('templateManager.delete.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleConfirmDelete();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t('templateManager.delete.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);

TemplateManagerDialog.displayName = 'TemplateManagerDialog';
