/**
 * 从选中字段创建模板对话框
 * 将用户选中的字段保存为可复用的模板
 */

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
