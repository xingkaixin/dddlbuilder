import { memo, useCallback, useMemo, useState } from 'react';
import { Copy, Pencil, Search, Trash2 } from '@/components/icons';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TableTemplate } from '@/hooks/useTableTemplates';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import { TableTemplatePreview } from './TableTemplatePreview';

interface TableTemplateManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TableTemplate[];
  loading: boolean;
  onRenameTemplate: (id: string, newName: string) => Promise<{ ok: boolean; message?: string }>;
  onDuplicateTemplate: (id: string, newName?: string) => Promise<{ ok: boolean; message?: string }>;
  onDeleteTemplate: (id: string) => Promise<{ ok: boolean; message?: string }>;
}

export const TableTemplateManagerDialog = memo<TableTemplateManagerDialogProps>(
  ({
    open,
    onOpenChange,
    templates,
    loading,
    onRenameTemplate,
    onDuplicateTemplate,
    onDeleteTemplate,
  }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [editingTemplate, setEditingTemplate] = useState<TableTemplate | null>(null);
    const [editName, setEditName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<TableTemplate | null>(null);

    const filteredTemplates = useMemo(() => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return templates;
      return templates.filter(
        (template) =>
          template.name.toLowerCase().includes(term) ||
          template.description?.toLowerCase().includes(term) === true ||
          template.blueprint.rows.some((row) => row.fieldName.toLowerCase().includes(term)),
      );
    }, [searchTerm, templates]);

    const handleOpenEdit = useCallback((template: TableTemplate) => {
      setEditingTemplate(template);
      setEditName(template.name);
    }, []);

    const handleRename = useCallback(async () => {
      if (!editingTemplate) return;
      const nextName = editName.trim();
      if (!nextName) return;
      const result = await onRenameTemplate(editingTemplate.id, nextName);
      if (result.ok) {
        showToast(t('tableTemplate.toast.renamed', { name: nextName }));
        setEditingTemplate(null);
      } else {
        showToast(result.message ?? t('tableTemplate.toast.renameFailed'));
      }
    }, [editName, editingTemplate, onRenameTemplate, showToast, t]);

    const handleDuplicate = useCallback(
      async (template: TableTemplate) => {
        const result = await onDuplicateTemplate(template.id);
        showToast(
          result.ok
            ? t('tableTemplate.toast.duplicated', { name: template.name })
            : (result.message ?? t('tableTemplate.toast.duplicateFailed')),
        );
      },
      [onDuplicateTemplate, showToast, t],
    );

    const handleDelete = useCallback(async () => {
      if (!deleteTarget) return;
      const result = await onDeleteTemplate(deleteTarget.id);
      showToast(
        result.ok
          ? t('tableTemplate.toast.deleted', { name: deleteTarget.name })
          : (result.message ?? t('tableTemplate.toast.deleteFailed')),
      );
      setDeleteTarget(null);
    }, [deleteTarget, onDeleteTemplate, showToast, t]);

    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t('tableTemplate.manager.title')}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('tableTemplate.manager.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-8"
                />
              </div>

              <div className="max-h-[520px] space-y-3 overflow-y-auto">
                {loading ? (
                  <div className="py-8 text-center text-muted-foreground">
                    {t('tableTemplate.loading')}
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    {t('tableTemplate.empty')}
                  </div>
                ) : (
                  filteredTemplates.map((template) => (
                    <div key={template.id} className="rounded-md border p-3">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{template.name}</div>
                          {template.description && (
                            <div className="truncate text-sm text-muted-foreground">
                              {template.description}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(template)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDuplicate(template)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(template)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <TableTemplatePreview blueprint={template.blueprint} />
                    </div>
                  ))
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('tableTemplate.manager.close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(editingTemplate)}
          onOpenChange={(nextOpen) => !nextOpen && setEditingTemplate(null)}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('tableTemplate.manager.renameTitle')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="table-template-name">{t('tableTemplate.manager.name')}</Label>
              <Input
                id="table-template-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                {t('tableTemplate.manager.cancel')}
              </Button>
              <Button onClick={() => void handleRename()} disabled={!editName.trim()}>
                {t('tableTemplate.manager.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('tableTemplate.manager.deleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('tableTemplate.manager.deleteDescription', { name: deleteTarget?.name ?? '' })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('tableTemplate.manager.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleDelete()}>
                {t('tableTemplate.manager.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);
TableTemplateManagerDialog.displayName = 'TableTemplateManagerDialog';
