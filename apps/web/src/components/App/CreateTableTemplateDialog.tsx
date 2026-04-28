import { memo, useCallback, useState } from 'react';
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

export const CreateTableTemplateDialog = memo<CreateTableTemplateDialogProps>(
  ({ open, onOpenChange, blueprint, onConfirm }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    const handleConfirm = useCallback(async () => {
      if (!blueprint || !name.trim()) return;
      setSaving(true);
      try {
        const result = await onConfirm(name, blueprint, description.trim() || undefined);
        if (result.ok) {
          setName('');
          setDescription('');
          onOpenChange(false);
        }
      } finally {
        setSaving(false);
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
                onChange={(event) => setName(event.target.value)}
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
                onChange={(event) => setDescription(event.target.value)}
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
