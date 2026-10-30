/**
 * 从选中字段创建模板对话框
 * 将用户选中的字段保存为可复用的模板
 */

import { memo, useReducer, useCallback, useMemo } from 'react';
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
import { useTranslation } from 'react-i18next';
import type { FieldRow } from '@ddlbuilder/shared-types';

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFields: Array<Partial<FieldRow>>;
  onConfirm: (
    name: string,
    fields: Array<Partial<FieldRow>>,
    description?: string,
  ) => Promise<{ ok: boolean }>;
}

type TemplateFormState = { name: string; description: string; error: string; loading: boolean };

type TemplateFormEvent =
  | { type: 'nameChanged'; name: string }
  | { type: 'descriptionChanged'; description: string }
  | { type: 'submitStarted' }
  | { type: 'submitFailed'; error: string }
  | { type: 'submitSettled' };

const initialTemplateFormState: TemplateFormState = {
  name: '',
  description: '',
  error: '',
  loading: false,
};

function templateFormReducer(
  state: TemplateFormState,
  event: TemplateFormEvent,
): TemplateFormState {
  switch (event.type) {
    case 'nameChanged':
      return { ...state, name: event.name, error: '' };
    case 'descriptionChanged':
      return { ...state, description: event.description };
    case 'submitStarted':
      return { ...state, loading: true };
    case 'submitFailed':
      return { ...state, error: event.error };
    case 'submitSettled':
      return { ...state, loading: false };
  }
}

export const CreateTemplateDialog = memo<CreateTemplateDialogProps>(
  ({ open, onOpenChange, selectedFields, onConfirm }) => {
    const { t } = useTranslation();

    const [{ name, description, error, loading }, dispatch] = useReducer(
      templateFormReducer,
      initialTemplateFormState,
    );

    // 过滤有效字段
    const validFields = useMemo(
      () => selectedFields.filter((f) => f.fieldName?.trim()),
      [selectedFields],
    );

    const handleConfirm = useCallback(async () => {
      const trimmedName = name.trim();

      if (!trimmedName) {
        dispatch({
          type: 'submitFailed',
          error: t('templateManager.createFromFieldsDialog.nameRequired'),
        });

        return;
      }

      dispatch({ type: 'submitStarted' });

      try {
        const result = await onConfirm(trimmedName, validFields, description.trim() || undefined);

        if (result.ok) {
          onOpenChange(false);
        } else {
          dispatch({
            type: 'submitFailed',
            error: t('templateManager.createFromFieldsDialog.createFailed'),
          });
        }
      } finally {
        dispatch({ type: 'submitSettled' });
      }
    }, [name, description, validFields, onConfirm, onOpenChange, t]);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('templateManager.createFromFieldsDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('templateManager.createFromFieldsDialog.description', {
                count: validFields.length,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* 字段预览 */}
            <div className="rounded-md bg-muted p-3">
              <div className="text-sm font-medium mb-2">
                {t('templateManager.createFromFieldsDialog.fieldPreviewTitle')}
              </div>
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
              <Label htmlFor="new-template-name">
                {t('templateManager.createFromFieldsDialog.nameLabel')}
              </Label>
              <Input
                id="new-template-name"
                value={name}
                onChange={(e) => dispatch({ type: 'nameChanged', name: e.target.value })}
                placeholder={t('templateManager.createFromFieldsDialog.namePlaceholder')}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-template-desc">
                {t('templateManager.createFromFieldsDialog.descriptionLabel')}
              </Label>
              <Input
                id="new-template-desc"
                value={description}
                onChange={(e) =>
                  dispatch({ type: 'descriptionChanged', description: e.target.value })
                }
                placeholder={t('templateManager.createFromFieldsDialog.descriptionPlaceholder')}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('templateManager.createFromFieldsDialog.cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading
                ? t('templateManager.createFromFieldsDialog.creating')
                : t('templateManager.createFromFieldsDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);

CreateTemplateDialog.displayName = 'CreateTemplateDialog';
