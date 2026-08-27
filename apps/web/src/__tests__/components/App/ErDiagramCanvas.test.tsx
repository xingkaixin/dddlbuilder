import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as ReactFlowModule from '@xyflow/react';
import type { ErEdgeData } from '@/components/App/er-diagram/types';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { buildSavedTableBatchImportPlan } from '@/utils/savedTableBatchImport';
import ErDiagramCanvas from '@/components/App/er-diagram/ErDiagramCanvas';
import {
  applySavedTableStateUpdate,
  type SavedTableStateUpdate,
} from '@/utils/savedTableStateUpdate';
import type { SavedTableTarget } from '@ddlbuilder/shared-types/workspace';

const capture = vi.hoisted(() => ({ edges: [] as ReactFlowModule.Edge[], fitView: vi.fn() }));

vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactFlowModule>()),
  ReactFlow: ({ edges }: ReactFlowModule.ReactFlowProps) => {
    capture.edges = edges ?? [];
    return null;
  },
  useReactFlow: () => ({ fitView: capture.fitView }),
}));

const original: SavedTableRecord = {
  tableId: 'original',
  normalizedName: 'orders',
  name: 'orders',
  createdAt: 1,
  updatedAt: 1,
  state: {
    schemaName: '',
    tableName: 'orders',
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [{ id: 'id', fieldName: 'id', fieldType: 'bigint', nullable: false }],
    indexes: [],
    addCount: 1,
    indexInput: '',
    currentIndexFields: [],
    authInput: '',
    authObjects: [],
    foreignKeys: [
      { id: 'fk-parent', name: 'fk_parent', fields: ['id'], refTable: 'parent', refFields: ['id'] },
    ],
  },
};

describe('ER relationship ownership', () => {
  it.each([false, true])('deletes only the selected table relationship (copy=%s)', async (copy) => {
    const imported = buildSavedTableBatchImportPlan(
      { items: [{ name: original.name, state: original.state }], conflictStrategy: 'rename' },
      [original],
      2,
    ).records[0];
    const parent = {
      ...original,
      tableId: 'parent',
      normalizedName: 'parent',
      name: 'parent',
      state: { ...original.state, tableName: 'parent', foreignKeys: [] },
    };
    const updates: SavedTableRecord[] = [];
    const onUpdateTable = vi.fn((target: SavedTableTarget, update: SavedTableStateUpdate) => {
      const record = applySavedTableStateUpdate(target, update, () => (copy ? imported : original));
      if (record) updates.push(record);
      return Promise.resolve({ ok: true as const, tableId: 'updated', normalizedName: 'updated' });
    });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <ErDiagramCanvas
        tables={[original, imported, parent]}
        loading={false}
        onSelectTable={vi.fn()}
        onAddTable={vi.fn()}
        onRefresh={onRefresh}
        onUpdateTable={onUpdateTable}
      />,
    );
    await waitFor(() => expect(capture.edges).toHaveLength(2));
    expect(new Set(capture.edges.map((edge) => edge.id)).size).toBe(2);
    const target = copy ? imported : original;
    const edge = capture.edges.find((item) => item.source === target.tableId);
    if (!edge?.data) throw new Error('Selected relationship was not rendered');
    await act(async () => {
      await (edge.data as ErEdgeData).onDelete();
    });
    expect(onUpdateTable).toHaveBeenCalledExactlyOnceWith(target, expect.any(Function));
    expect(updates[0].state).toEqual({
      ...target.state,
      foreignKeys: [],
    });
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(original.state.foreignKeys).toHaveLength(1);
    expect(imported.state.foreignKeys).toHaveLength(1);
  });
});
