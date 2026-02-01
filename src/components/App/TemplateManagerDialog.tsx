/**
 * 模板管理对话框组件
 * 提供模板的查看、创建、编辑、删除功能，包含字段编辑器
 */

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  FileText,
  Search,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldTemplate, TemplateField } from '@/hooks/useFieldTemplates';

// 空字段默认值
const createEmptyField = (): TemplateField => ({
  fieldName: '',
  fieldType: '',
  fieldComment: '',
  nullable: '是',
  defaultKind: '无',
  defaultValue: '',
  onUpdate: '无',
});

// 字段编辑行组件
interface FieldEditRowProps {
  field: TemplateField;
  index: number;
  total: number;
  onChange: (index: number, field: TemplateField) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
}

const FieldEditRow = memo<FieldEditRowProps>(
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
          />
          <Input
            placeholder="类型"
            value={field.fieldType}
            onChange={(e) => handleChange('fieldType', e.target.value)}
            className="h-8 text-xs font-mono"
            title="数据类型"
          />
          <Input
            placeholder="注释"
            value={field.fieldComment || ''}
            onChange={(e) => handleChange('fieldComment', e.target.value)}
            className="h-8 text-xs"
            title="说明文字"
          />
          <Select
            value={field.nullable}
            onValueChange={(value) =>
              handleChange('nullable', value as '是' | '否')
            }
          >
            <SelectTrigger className="h-8 text-[11px] px-2 text-center">
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
          />
          <Input
            placeholder="默认值"
            value={field.defaultValue || ''}
            onChange={(e) => handleChange('defaultValue', e.target.value)}
            className="h-8 text-xs"
            title="默认内容"
          />
          <Input
            placeholder="更新时"
            value={field.onUpdate || ''}
            onChange={(e) => handleChange('onUpdate', e.target.value)}
            className="h-8 text-xs"
            title="更新操作"
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  },
);
FieldEditRow.displayName = 'FieldEditRow';

// 模板列表项组件
interface TemplateListItemProps {
  template: FieldTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const TemplateListItem = memo<TemplateListItemProps>(
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
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDuplicate}
            title="复制"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  },
);
TemplateListItem.displayName = 'TemplateListItem';

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
  ) => Promise<{ ok: boolean }>;
  onUpdateTemplate: (
    id: string,
    updates: Partial<Pick<FieldTemplate, 'name' | 'description' | 'fields'>>,
  ) => Promise<{ ok: boolean }>;
  onDuplicateTemplate: (
    id: string,
    newName?: string,
  ) => Promise<{ ok: boolean }>;
  onDeleteTemplate: (id: string) => Promise<{ ok: boolean }>;
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
    const [searchTerm, setSearchTerm] = useState('');
    const [editingTemplate, setEditingTemplate] =
      useState<FieldTemplate | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editFields, setEditFields] = useState<TemplateField[]>([]);
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
        setEditFields([...template.fields]);
      } else {
        setEditingTemplate(null);
        setEditName('');
        setEditDescription('');
        // 新建时提供一个空字段
        setEditFields([createEmptyField()]);
      }
      setEditError('');
      setIsSaving(false);
      setIsEditDialogOpen(true);
    }, []);

    // 添加字段
    const handleAddField = useCallback(() => {
      setEditFields((prev) => [...prev, createEmptyField()]);
    }, []);

    // 更新字段
    const handleFieldChange = useCallback(
      (index: number, field: TemplateField) => {
        setEditFields((prev) => {
          const next = [...prev];
          next[index] = field;
          return next;
        });
      },
      [],
    );

    // 删除字段
    const handleRemoveField = useCallback((index: number) => {
      setEditFields((prev) => prev.filter((_, i) => i !== index));
    }, []);

    // 移动字段
    const handleMoveField = useCallback(
      (index: number, direction: 'up' | 'down') => {
        setEditFields((prev) => {
          const next = [...prev];
          const targetIndex = direction === 'up' ? index - 1 : index + 1;
          if (targetIndex < 0 || targetIndex >= next.length) return prev;
          [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
          return next;
        });
      },
      [],
    );

    // 保存模板
    const handleSaveTemplate = useCallback(async () => {
      const trimmedName = editName.trim();
      if (!trimmedName) {
        setEditError('请输入模板名称');
        return;
      }

      // 过滤掉空字段
      const validFields = editFields.filter((f) => f.fieldName.trim());

      setIsSaving(true);
      setEditError('');

      try {
        let result: { ok: boolean };
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
        } else {
          setEditError('保存失败');
        }
      } finally {
        setIsSaving(false);
      }
    }, [
      editName,
      editDescription,
      editFields,
      editingTemplate,
      onUpdateTemplate,
      onCreateTemplate,
    ]);

    // 复制模板
    const handleDuplicate = useCallback(
      async (template: FieldTemplate) => {
        await onDuplicateTemplate(template.id);
      },
      [onDuplicateTemplate],
    );

    // 打开删除确认
    const handleOpenDeleteDialog = useCallback((template: FieldTemplate) => {
      setDeleteTarget(template);
      setIsDeleteDialogOpen(true);
    }, []);

    // 确认删除
    const handleConfirmDelete = useCallback(async () => {
      if (!deleteTarget) return;
      await onDeleteTemplate(deleteTarget.id);
      setIsDeleteDialogOpen(false);
      setDeleteTarget(null);
    }, [deleteTarget, onDeleteTemplate]);

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
              <DialogTitle>字段模板管理</DialogTitle>
              <DialogDescription>
                管理可复用的字段模板，快速应用到表结构中
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* 搜索和新建 */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索模板..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button onClick={() => handleOpenEditDialog()}>
                  <Plus className="mr-1 h-4 w-4" />
                  新建
                </Button>
              </div>

              {/* 模板列表 */}
              <div className="max-h-[400px] space-y-2 overflow-y-auto">
                {loading ? (
                  <div className="py-8 text-center text-muted-foreground">
                    加载中...
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    {searchTerm
                      ? '未找到匹配的模板'
                      : '暂无模板，点击「新建」创建'}
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
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新建/编辑对话框 - 包含字段编辑器 */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[90vw] md:max-w-4xl lg:max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? '编辑模板' : '新建模板'}
              </DialogTitle>
              <DialogDescription>
                {editingTemplate
                  ? '修改模板名称、描述和字段'
                  : '创建一个新的字段模板'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-4 min-h-0">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="template-name">模板名称</Label>
                  <Input
                    id="template-name"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      setEditError('');
                    }}
                    placeholder="例如：审计字段"
                    autoFocus
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="template-desc">描述（可选）</Label>
                  <Input
                    id="template-desc"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="简要说明模板用途"
                  />
                </div>
              </div>

              {/* 字段编辑区 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>字段列表</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddField}
                    className="h-7"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    添加字段
                  </Button>
                </div>

                {/* 表头 */}
                <div className="grid grid-cols-[24px_1.5fr_1.2fr_1.5fr_80px_1fr_1fr_1fr_28px] gap-2 px-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  <div />
                  <span>字段名</span>
                  <span>类型</span>
                  <span>注释</span>
                  <span className="text-center">可空</span>
                  <span>默认类型</span>
                  <span>默认值</span>
                  <span>更新时</span>
                  <div />
                </div>

                {/* 字段列表 */}
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {editFields.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground border rounded-md">
                      暂无字段，点击「添加字段」开始
                    </div>
                  ) : (
                    editFields.map((field, index) => (
                      <FieldEditRow
                        key={index}
                        field={field}
                        index={index}
                        total={editFields.length}
                        onChange={handleFieldChange}
                        onRemove={handleRemoveField}
                        onMove={handleMoveField}
                      />
                    ))
                  )}
                </div>
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
                取消
              </Button>
              <Button onClick={handleSaveTemplate} disabled={isSaving}>
                {isSaving ? '保存中...' : editingTemplate ? '保存' : '创建模板'}
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
              <AlertDialogTitle>删除模板</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除模板「{deleteTarget?.name}」吗？此操作无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmDelete();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);
TemplateManagerDialog.displayName = 'TemplateManagerDialog';

// 从选中字段创建模板对话框
interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFields: Array<{
    fieldName?: string;
    fieldType?: string;
    fieldComment?: string;
    nullable?: string;
    defaultKind?: string;
    defaultValue?: string;
    onUpdate?: string;
  }>;
  onConfirm: (
    name: string,
    fields: Array<{
      fieldName?: string;
      fieldType?: string;
      fieldComment?: string;
      nullable?: string;
      defaultKind?: string;
      defaultValue?: string;
      onUpdate?: string;
    }>,
    description?: string,
  ) => Promise<{ ok: boolean }>;
}

export const CreateTemplateDialog = memo<CreateTemplateDialogProps>(
  ({ open, onOpenChange, selectedFields, onConfirm }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // 过滤有效字段
    const validFields = useMemo(
      () => selectedFields.filter((f) => f.fieldName?.trim()),
      [selectedFields],
    );

    // 重置状态
    useEffect(() => {
      if (open) {
        setName('');
        setDescription('');
        setError('');
        setLoading(false);
      }
    }, [open]);

    const handleConfirm = useCallback(async () => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        setError('请输入模板名称');
        return;
      }

      setLoading(true);
      try {
        const result = await onConfirm(
          trimmedName,
          validFields,
          description.trim() || undefined,
        );
        if (result.ok) {
          onOpenChange(false);
        } else {
          setError('创建失败');
        }
      } finally {
        setLoading(false);
      }
    }, [name, description, validFields, onConfirm, onOpenChange]);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>保存为模板</DialogTitle>
            <DialogDescription>
              将选中的 {validFields.length} 个字段保存为可复用的模板
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* 字段预览 */}
            <div className="rounded-md bg-muted p-3">
              <div className="text-sm font-medium mb-2">包含字段：</div>
              <div className="flex flex-wrap gap-1">
                {validFields.map((f, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs"
                  >
                    {f.fieldName}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-template-name">模板名称</Label>
              <Input
                id="new-template-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="例如：审计字段"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-template-desc">描述（可选）</Label>
              <Input
                id="new-template-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要说明模板用途"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? '创建中...' : '创建模板'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);
CreateTemplateDialog.displayName = 'CreateTemplateDialog';
