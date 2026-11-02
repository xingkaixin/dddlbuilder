import type { FieldColumn } from '@/stores/preferencesStore';

export const FIELD_COLUMN_LABELS = {
  fieldComment: 'fieldComment',
  fieldType: 'fieldType',
  nullable: 'nullable',
  default: 'defaultValue',
  onUpdate: 'onUpdate',
} as const satisfies Record<FieldColumn, string>;
