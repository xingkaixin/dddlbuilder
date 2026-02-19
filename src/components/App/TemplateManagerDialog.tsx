/**
 * 模板管理对话框组件
 * 提供模板的查看、创建、编辑、删除功能，包含字段编辑器
 */

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
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
import type { DatabaseType, FieldRow } from '@/types';
import { createEmptyRow, ensureOrder } from '@/utils/helpers';
import { useAppStore } from '@/stores';
import { TemplateListItem } from './TemplateListItem';
import { TemplateFieldTable } from './TemplateFieldTable';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';

const toFieldRows = (fields: TemplateField[]): FieldRow[] => {
  if (fields.length === 0) {
    return [createEmptyRow(0)];
  }

  return fields.map((field, index) => ({
    ...createEmptyRow(index),
    order: index + 1,
    fieldName: field.fieldName,
    fieldComment: field.fieldComment || '',
    fieldType: field.fieldType,
    nullable: field.nullable === '否' ? '否' : '是',
    defaultKind: field.defaultKind || '无',
    defaultValue: field.defaultValue || '',
    onUpdate: field.onUpdate || '无',
  }));
};

const toTemplateFields = (rows: FieldRow[]): TemplateField[] => {
  return rows
    .filter((row) => row.fieldName.trim())
    .map((row) => ({
      fieldName: row.fieldName.trim(),
      fieldType: row.fieldType.trim(),
      fieldComment: row.fieldComment?.trim() || undefined,
      nullable: row.nullable === '否' ? '否' : '是',
      defaultKind: row.defaultKind || '无',
      defaultValue: row.defaultValue || '',
      onUpdate: row.onUpdate || '无',
    }));
};

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
  onDuplicateTemplate: (
    id: string,
    newName?: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  onDeleteTemplate: (id: string) => Promise<{ ok: boolean; message?: string }>;
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
    const dbType = useAppStore((state) => state.dbType) as DatabaseType;
    const [searchTerm, setSearchTerm] = useState('');
    const [editingTemplate, setEditingTemplate] =
      useState<FieldTemplate | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editRows, setEditRows] = useState<FieldRow[]>([]);
    const [editError, setEditError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<FieldTemplate | null>(
      null,
    );
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    // 过滤模板
    const filteredTemplates = useMemo(() => {
      if (!searchTerm.trim()) return templates;
      const term = searchTerm.toLowerCase();
      return templates.filter(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          t.description?.toLowerCase().includes(term),
      );
    }, [templates, searchTerm]);

    // 打开新建/编辑对话框
    const handleOpenEditDialog = useCallback((template?: FieldTemplate) => {
      if (template) {
        setEditingTemplate(template);
        setEditName(template.name);
        setEditDescription(template.description || '');
        setEditRows(toFieldRows(template.fields));
      } else {
        setEditingTemplate(null);
        setEditName('');
        setEditDescription('');
        // 新建时提供一个空字段
        setEditRows([createEmptyRow(0)]);
      }
      setEditError('');
      setIsSaving(false);
      setIsEditDialogOpen(true);
    }, []);

    // 添加字段
    const handleAddField = useCallback(() => {
      setEditRows((prev) => [...prev, createEmptyRow(prev.length)]);
    }, []);

    // 保存模板
    const handleSaveTemplate = useCallback(async () => {
      const trimmedName = editName.trim();
      if (!trimmedName) {
        setEditError(t('templateManager.editor.nameRequired'));
        return;
      }

      const validFields = toTemplateFields(editRows);

      setIsSaving(true);
      setEditError('');

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
          setIsEditDialogOpen(false);
          setEditingTemplate(null);
          showToast(
            editingTemplate
              ? t('templateManager.toast.updated', { name: trimmedName })
              : t('templateManager.toast.created', { name: trimmedName }),
          );
        } else {
          setEditError(t('templateManager.toast.saveFailed'));
          showToast(
            result.message ?? t('templateManager.toast.saveFailedRetry'),
          );
        }
      } finally {
        setIsSaving(false);
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
          showToast(
            t('templateManager.toast.duplicated', { name: template.name }),
          );
        } else {
          showToast(
            result.message ?? t('templateManager.toast.duplicateFailed'),
          );
        }
      },
      [onDuplicateTemplate, showToast, t],
    );

    // 打开删除确认
    const handleOpenDeleteDialog = useCallback((template: FieldTemplate) => {
      setDeleteTarget(template);
      setIsDeleteDialogOpen(true);
    }, []);

    // 确认删除
    const handleConfirmDelete = useCallback(async () => {
      if (!deleteTarget) return;
      const result = await onDeleteTemplate(deleteTarget.id);
      if (result.ok) {
        showToast(
          t('templateManager.toast.deleted', { name: deleteTarget.name }),
        );
      } else {
        showToast(result.message ?? t('templateManager.toast.deleteFailed'));
      }
      setIsDeleteDialogOpen(false);
      setDeleteTarget(null);
    }, [deleteTarget, onDeleteTemplate, showToast, t]);

    // 关闭时重置状态
    useEffect(() => {
      if (!open) {
        setSearchTerm('');
      }
    }, [open]);

    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{t('templateManager.title')}</DialogTitle>
              <DialogDescription>
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
                    onChange={(e) => setSearchTerm(e.target.value)}
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
                    {searchTerm
                      ? t('templateManager.emptyFiltered')
                      : t('templateManager.empty')}
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
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[90vw] md:max-w-4xl lg:max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate
                  ? t('templateManager.editor.editTitle')
                  : t('templateManager.editor.createTitle')}
              </DialogTitle>
              <DialogDescription>
                {editingTemplate
                  ? t('templateManager.editor.editDescription')
                  : t('templateManager.editor.createDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-4 min-h-0">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="template-name">
                    {t('templateManager.editor.name')}
                  </Label>
                  <Input
                    id="template-name"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      setEditError('');
                    }}
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
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t(
                      'templateManager.editor.descriptionPlaceholder',
                    )}
                  />
                </div>
              </div>

              {/* 字段编辑区 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('templateManager.editor.fieldList')}</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddField}
                    className="h-7"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t('templateManager.editor.addField')}
                  </Button>
                </div>

                <TemplateFieldTable
                  rows={editRows}
                  setRows={(next) => {
                    setEditRows((prev) =>
                      ensureOrder(
                        typeof next === 'function' ? next(prev) : next,
                      ),
                    );
                  }}
                  dbType={dbType}
                />
              </div>

              {editError && (
                <p className="text-sm text-destructive">{editError}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
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
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('templateManager.delete.title')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('templateManager.delete.description', {
                  name: deleteTarget?.name || '',
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t('templateManager.delete.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmDelete();
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
