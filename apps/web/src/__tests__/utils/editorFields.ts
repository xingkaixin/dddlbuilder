import type { DatabaseType } from '@ddlbuilder/shared-types';
import { useEditorStore } from '@/stores';
import { createEmptyRow } from '@/utils/helpers';

export function renameEditorField(oldName: string, newName: string, dbType?: DatabaseType) {
  const row = { ...createEmptyRow(), fieldName: oldName };
  useEditorStore.setState({ rows: [row], ...(dbType ? { dbType } : {}) });
  useEditorStore.getState().setRows([{ ...row, fieldName: newName }]);
}
