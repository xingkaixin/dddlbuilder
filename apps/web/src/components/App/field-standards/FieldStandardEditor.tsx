import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DatabaseType, FieldRow } from '@ddlbuilder/shared-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TemplateFieldTable } from '../TemplateFieldTable';
import { standardField, type FieldStandard } from '@/utils/fieldStandards';

export function FieldStandardEditor({
  standard,
  dbType,
  onSave,
  onCancel,
  busy,
}: {
  standard: FieldStandard;
  dbType: DatabaseType;
  onSave: (standard: FieldStandard) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(standard.name);
  const [description, setDescription] = useState(standard.description);
  const [unit, setUnit] = useState(standard.unit);
  const [rows, setRows] = useState<FieldRow[]>([{ ...standard.field, id: standard.id }]);
  const field = rows[0];

  const canSave =
    !!name.trim() && rows.length === 1 && !!field?.fieldName.trim() && !!field.fieldType.trim();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="standard-name" className="text-sm font-medium">
            {t('fieldStandards.name')}
          </label>
          <Input
            id="standard-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="standard-unit" className="text-sm font-medium">
            {t('fieldStandards.unit')}
          </label>
          <Input
            id="standard-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          />
        </div>
      </div>
      <div>
        <label htmlFor="standard-description" className="text-sm font-medium">
          {t('fieldStandards.description')}
        </label>
        <Textarea
          id="standard-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t('fieldStandards.editorHint')}</p>
      <TemplateFieldTable rows={rows} setRows={setRows} dbType={dbType} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          {t('fieldStandards.cancel')}
        </Button>
        <Button
          disabled={!canSave || busy}
          onClick={() =>
            void onSave({
              ...standard,
              name: name.trim(),
              description,
              unit,
              field: standardField(field),
            })
          }
        >
          {t('fieldStandards.save')}
        </Button>
      </div>
    </div>
  );
}
