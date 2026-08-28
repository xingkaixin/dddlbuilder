import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type * as ReactFlowModule from '@xyflow/react';
import { render, screen } from '@/__tests__/utils/test-utils';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { useSavedTables } from '@/hooks/useSavedTables';
import ErDiagramDialog from '@/components/App/ErDiagramDialog';
import { getSavedTableFromYDoc, upsertSavedTableInYDoc } from '@/services/workspaceYDocAdapter';
import { getSavedTable, updateSavedTable } from '@/utils/savedTablesDb';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import type { ErEdgeData } from '@/components/App/er-diagram/types';

const capture = vi.hoisted(() => ({
  doc: null as Y.Doc | null,
  edges: [] as ReactFlowModule.Edge[],
  connect: undefined as ReactFlowModule.ReactFlowProps['onConnect'],
  fitView: vi.fn(),
}));
vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    status: capture.doc ? 'signed_in' : 'signed_out',
    userId: 'user',
    workspaceId: 'workspace',
    workspaceScope: capture.doc ? { kind: 'user', userId: 'user', workspaceId: 'workspace' } : null,
  }),
}));
vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDocDocument: () => ({ doc: capture.doc, localSynced: true, synced: true }),
}));
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactFlowModule>()),
  ReactFlow: ({ edges, onConnect }: ReactFlowModule.ReactFlowProps) => {
    capture.edges = edges ?? [];
    capture.connect = onConnect;
    return null;
  },
  useReactFlow: () => ({ fitView: capture.fitView }),
}));

const source: SavedTableRecord = {
  tableId: 'source',
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
    rows: [{ id: 'field-id', fieldName: 'id', fieldType: 'INT', nullable: true }],
    indexes: [],
    addCount: 1,
    indexInput: '',
    currentIndexFields: [],
    authInput: '',
    authObjects: [],
  },
};
const parent: SavedTableRecord = {
  ...source,
  tableId: 'parent',
  normalizedName: 'parent',
  name: 'parent',
  state: {
    ...source.state,
    tableName: 'parent',
    indexes: [
      {
        id: 'pk',
        name: 'pk_parent',
        fields: [{ name: 'id', direction: 'ASC' }],
        kind: 'primary',
      },
    ],
  },
};
const foreignKey = {
  id: 'fk',
  name: 'fk_parent',
  fields: ['id'],
  refTable: 'parent',
  refFields: ['id'],
};
const scope = { kind: 'anonymous' } as const;

const write = async (record: SavedTableRecord) => {
  if (capture.doc) upsertSavedTableInYDoc(capture.doc, record);
  else await updateSavedTable(record, scope);
};
const read = async (target = source) => {
  const record = capture.doc
    ? getSavedTableFromYDoc(capture.doc, target)
    : await getSavedTable(target, scope);
  if (!record) throw new Error('Saved table not found');
  return record;
};
function App() {
  const saved = useSavedTables();
  return (
    <ErDiagramDialog
      open
      onOpenChange={() => {}}
      onSelectTable={() => {}}
      saveTable={saved.saveTable}
      overwriteTable={saved.overwriteTable}
      loadTables={saved.loadTables}
    />
  );
}

describe.each(['ydoc', 'indexeddb'] as const)('ER persistence: %s', (backend) => {
  beforeEach(async () => {
    setupFakeIndexedDB();
    capture.doc = backend === 'ydoc' ? new Y.Doc() : null;
    capture.edges = [];
    capture.connect = undefined;
    await write(source);
    await write(parent);
  });
  afterEach(() => {
    cleanup();
    capture.doc?.destroy();
    capture.doc = null;
    teardownFakeIndexedDB();
  });

  it('删除关系保留打开图之后收到的字段和注释', async () => {
    await write({ ...source, state: { ...source.state, foreignKeys: [foreignKey] } });
    render(<App />);
    await waitFor(() => expect(capture.edges).toHaveLength(1));
    await act(async () => {
      const current = await read();
      await write({
        ...current,
        state: {
          ...current.state,
          tableComment: 'remote comment',
          rows: [...current.state.rows, { id: 'new', fieldName: 'remote_note', fieldType: 'TEXT' }],
        },
      });
    });
    const edge = capture.edges[0];
    await act(async () => {
      await (edge.data as ErEdgeData).onDelete();
    });
    const updated = await read();
    expect(updated.state.tableComment).toBe('remote comment');
    expect(updated.state.rows.map((row) => row.fieldName)).toEqual(['id', 'remote_note']);
    expect(updated.state.foreignKeys ?? []).toEqual([]);
  });

  it.each([false, true])(
    '建立关系使用最新源表和目标表 (targetDeleted=%s)',
    async (targetDeleted) => {
      render(<App />);
      await waitFor(() => expect(capture.connect).toBeTypeOf('function'));
      act(() =>
        capture.connect?.({
          source: 'source',
          target: 'parent',
          sourceHandle: 'id',
          targetHandle: 'id',
        }),
      );
      await screen.findByRole('button', { name: '创建关系', exact: true });
      await act(async () => {
        const current = await read();
        await write({
          ...current,
          state: { ...current.state, tableComment: 'new source comment' },
        });
        await write({
          ...parent,
          ...(targetDeleted ? { trashedAt: 2 } : {}),
          state: { ...parent.state, tableName: 'renamed_parent' },
        });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '创建关系', exact: true }));
      });
      await waitFor(async () => {
        const updated = await read();
        expect((updated.state.foreignKeys ?? []).map((key) => key.refTable)).toEqual(
          targetDeleted ? [] : ['renamed_parent'],
        );
        expect(
          screen
            .queryByRole('button', { name: '创建关系', exact: true })
            ?.hasAttribute('disabled') ?? false,
        ).toBe(false);
      });
      expect((await read()).state.tableComment).toBe('new source comment');
    },
  );
});
