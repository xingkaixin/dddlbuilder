import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type * as ReactFlowModule from '@xyflow/react';
import { createFieldRow } from '@/__tests__/utils/testFactories';
import { render } from '@/__tests__/utils/test-utils';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { useSavedTables } from '@/hooks/useSavedTables';
import ErPage from '@/components/App/ErPage';
import { getSavedTableFromYDoc, upsertSavedTableInYDoc } from '@/services/workspaceYDocAdapter';
import { getSavedTable, updateSavedTable } from '@/utils/savedTablesDb';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';

type Capture = {
  doc: Y.Doc | null;
  edges: ReactFlowModule.Edge[];
  connect: ReactFlowModule.ReactFlowProps['onConnect'] | undefined;
  fitView: ReturnType<typeof vi.fn>;
};

const capture = vi.hoisted((): Capture => ({
  doc: null,
  edges: [],
  connect: undefined,
  fitView: vi.fn(),
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- Injects auth state so this ER persistence test can exercise anonymous and signed-in workspace paths.
vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthIdentity = () => ({
    status: capture.doc ? 'signed_in' : 'signed_out',
    userId: 'user',
    workspaceId: 'workspace',
    workspaceScope: capture.doc ? { kind: 'user', userId: 'user', workspaceId: 'workspace' } : null,
  });

  return { useAuthIdentity };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- Supplies a controlled Y.Doc lifecycle while the component's persistence behavior remains real.
vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDocDocument: () => ({ doc: capture.doc, localSynced: true, synced: true }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Adapts the graph renderer to jsdom while retaining the real React Flow exports used by the component.
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
    rows: [createFieldRow('field-id', { fieldName: 'id', fieldType: 'INT' })],
    indexes: [],
    addCount: 1,
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
    <ErPage
      ready
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
    await act(() => vi.dynamicImportSettled());
    await waitFor(() => expect(capture.edges).toHaveLength(1));
    await act(async () => {
      const current = await read();
      await write({
        ...current,
        state: {
          ...current.state,
          tableComment: 'remote comment',
          rows: [
            ...current.state.rows,
            createFieldRow('new', { fieldName: 'remote_note', fieldType: 'TEXT' }),
          ],
        },
      });
    });
    const edge = capture.edges[0];
    const edgeData = edge?.data;

    expect(edgeData).toMatchObject({ onDelete: expect.any(Function) });
    // SAFETY: The preceding structural assertion establishes the callback contract for this captured edge.
    const deleteEdgeData = edgeData as { onDelete: () => void | Promise<void> };

    await act(async () => {
      await deleteEdgeData.onDelete();
    });
    const updated = await read();
    expect(updated.state.tableComment).toBe('remote comment');
    expect(updated.state.rows.map((row) => row.fieldName)).toEqual(['id', 'remote_note']);
    expect(updated.state.foreignKeys ?? []).toEqual([]);
  });
});
