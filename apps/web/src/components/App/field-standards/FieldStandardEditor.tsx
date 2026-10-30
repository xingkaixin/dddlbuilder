import { useCallback, useReducer, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { DatabaseType, FieldRow } from '@ddlbuilder/shared-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TemplateFieldTable } from '../TemplateFieldTable';
import { standardField, type FieldStandard } from '@/utils/fieldStandards';

type EditorState = { name: string; description: string; unit: string; rows: FieldRow[] };

type EditorTextField = 'name' | 'description' | 'unit';

type EditorEvent =
  | { type: 'fieldChanged'; field: EditorTextField; value: string }
  | { type: 'rowsChanged'; update: SetStateAction<FieldRow[]> };

function editorReducer(state: EditorState, event: EditorEvent): EditorState {
  switch (event.type) {
    case 'fieldChanged':
      return { ...state, [event.field]: event.value };
    case 'rowsChanged':
      return {
        ...state,
        rows: Array.isArray(event.update) ? event.update : event.update(state.rows),
      };
  }
}

const initEditorState = (standard: FieldStandard): EditorState => ({
  name: standard.name,
  description: standard.description,
  unit: standard.unit,
  rows: [{ ...standard.field, id: standard.id }],
});

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

  const [{ name, description, unit, rows }, dispatch] = useReducer(
    editorReducer,
    standard,
    initEditorState,
  );

  const setRows = useCallback(
    (update: SetStateAction<FieldRow[]>) => dispatch({ type: 'rowsChanged', update }),
    [],
  );
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
            onChange={(event) =>
              dispatch({ type: 'fieldChanged', field: 'name', value: event.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor="standard-unit" className="text-sm font-medium">
            {t('fieldStandards.unit')}
          </label>
          <Input
            id="standard-unit"
            value={unit}
            onChange={(event) =>
              dispatch({ type: 'fieldChanged', field: 'unit', value: event.target.value })
            }
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
          onChange={(event) =>
            dispatch({ type: 'fieldChanged', field: 'description', value: event.target.value })
          }
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
