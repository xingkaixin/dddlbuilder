import { memo, useCallback, useReducer } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import type { TableBlueprint } from '@/hooks/useTableTemplates';
import { TableTemplatePreview } from './TableTemplatePreview';
import { useTranslation } from 'react-i18next';

interface CreateTableTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blueprint: TableBlueprint | null;
  onConfirm: (
    name: string,
    blueprint: TableBlueprint,
    description?: string,
  ) => Promise<{ ok: boolean; message?: string }>;
}

type TemplateFormState = { name: string; description: string; saving: boolean };

type TemplateFormEvent =
  | { type: 'nameChanged'; name: string }
  | { type: 'descriptionChanged'; description: string }
  | { type: 'saveStarted' }
  | { type: 'saved' }
  | { type: 'saveSettled' };

const initialTemplateFormState: TemplateFormState = { name: '', description: '', saving: false };

function templateFormReducer(
  state: TemplateFormState,
  event: TemplateFormEvent,
): TemplateFormState {
  switch (event.type) {
    case 'nameChanged':
      return { ...state, name: event.name };
    case 'descriptionChanged':
      return { ...state, description: event.description };
    case 'saveStarted':
      return { ...state, saving: true };
    case 'saved':
      return { ...state, name: '', description: '' };
    case 'saveSettled':
      return { ...state, saving: false };
  }
}

export const CreateTableTemplateDialog = memo<CreateTableTemplateDialogProps>(
  ({ open, onOpenChange, blueprint, onConfirm }) => {
    const { t } = useTranslation();

    const [{ name, description, saving }, dispatch] = useReducer(
      templateFormReducer,
      initialTemplateFormState,
    );

    const handleConfirm = useCallback(async () => {
      if (!blueprint || !name.trim()) return;
      dispatch({ type: 'saveStarted' });

      try {
        const result = await onConfirm(name, blueprint, description.trim() || undefined);

        if (result.ok) {
          dispatch({ type: 'saved' });
          onOpenChange(false);
        }
      } finally {
        dispatch({ type: 'saveSettled' });
      }
    }, [blueprint, description, name, onConfirm, onOpenChange]);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('tableTemplate.create.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="create-table-template-name">{t('tableTemplate.create.name')}</Label>
              <Input
                id="create-table-template-name"
                value={name}
                onChange={(event) => dispatch({ type: 'nameChanged', name: event.target.value })}
                placeholder={t('tableTemplate.create.namePlaceholder')}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-table-template-description">
                {t('tableTemplate.create.description')}
              </Label>
              <Textarea
                id="create-table-template-description"
                value={description}
                onChange={(event) =>
                  dispatch({ type: 'descriptionChanged', description: event.target.value })
                }
                placeholder={t('tableTemplate.create.descriptionPlaceholder')}
              />
            </div>
            {blueprint && <TableTemplatePreview blueprint={blueprint} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('tableTemplate.create.cancel')}
            </Button>
            <Button onClick={() => void handleConfirm()} disabled={!name.trim() || saving}>
              {saving ? t('tableTemplate.create.saving') : t('tableTemplate.create.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);

CreateTableTemplateDialog.displayName = 'CreateTableTemplateDialog';
