import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useSavedTableRecord } from '@/hooks/useSavedTableRecord';
import { getSavedTable, type SavedTableRecord } from '@/utils/savedTablesDb';
import type * as SavedTablesDb from '@/utils/savedTablesDb';
import { deleteSavedTableFromYDoc, upsertSavedTableInYDoc } from '@/services/workspaceYDocAdapter';
import { workspaceLocalQueryKeys } from '@/queries/workspaceLocal';
import { createQueryClientWrapper } from '../utils/queryClient';

const workspace = vi.hoisted(() => ({
  scope: { kind: 'anonymous' } as WorkspaceScope,
  doc: null as Y.Doc | null,
  localSynced: true,
}));
vi.mock('@/hooks/useWorkspaceScope', () => ({ useWorkspaceScope: () => workspace.scope }));
vi.mock('@/providers/WorkspaceYDocProvider', () => ({ useWorkspaceYDocDocument: () => workspace }));
vi.mock('@/utils/savedTablesDb', async (importOriginal) => ({
  ...(await importOriginal<typeof SavedTablesDb>()),
  getSavedTable: vi.fn(),
}));

const target = { tableId: 'users-id', normalizedName: 'users' };
const record: SavedTableRecord = {
  ...target,
  name: 'Users',
  createdAt: 1,
  updatedAt: 1,
  state: withDefaultEditorSession({
    schemaName: '',
    tableName: 'users',
    tableComment: '',
    dbType: 'mysql',
    rows: [],
    indexes: [],
    authInput: '',
    authObjects: [],
  }),
};

describe('useSavedTableRecord', () => {
  beforeEach(() => {
    workspace.scope = { kind: 'anonymous' };
    workspace.doc = null;
    vi.mocked(getSavedTable).mockReset().mockResolvedValue(record);
  });

  it('caches by table identity and refreshes the baseline after local writes', async () => {
    const { wrapper, queryClient } = createQueryClientWrapper();
    const { result, rerender, unmount } = renderHook(() => useSavedTableRecord({ ...target }), {
      wrapper,
    });
    await waitFor(() => expect(result.current).toEqual(record));
    rerender();
    expect(getSavedTable).toHaveBeenCalledTimes(1);

    const updated = { ...record, state: { ...record.state, tableComment: 'saved again' } };
    vi.mocked(getSavedTable).mockResolvedValue(updated);
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: workspaceLocalQueryKeys.scope(workspace.scope),
      });
    });
    await waitFor(() => expect(result.current?.state.tableComment).toBe('saved again'));
    unmount();
    queryClient.clear();
  });

  it('reads and tracks the authoritative Y.Doc instead of legacy local data', () => {
    workspace.scope = { kind: 'user', userId: 'u', workspaceId: 'w' };
    const doc = new Y.Doc();
    workspace.doc = doc;
    upsertSavedTableInYDoc(doc, record);
    const { wrapper, queryClient } = createQueryClientWrapper();
    const { result, unmount } = renderHook(() => useSavedTableRecord(target), { wrapper });
    expect(result.current?.state.tableName).toBe('users');
    expect(getSavedTable).not.toHaveBeenCalled();

    act(() => {
      upsertSavedTableInYDoc(doc, {
        ...record,
        updatedAt: 2,
        state: { ...record.state, tableComment: 'remote save' },
      });
    });
    expect(result.current?.state.tableComment).toBe('remote save');
    act(() => deleteSavedTableFromYDoc(doc, target));
    expect(result.current).toBeNull();
    unmount();
    queryClient.clear();
    doc.destroy();
  });

  it('does not keep the previous workspace record after switching scope', async () => {
    const { wrapper, queryClient } = createQueryClientWrapper();
    const { result, rerender, unmount } = renderHook(() => useSavedTableRecord(target), {
      wrapper,
    });
    await waitFor(() => expect(result.current).toEqual(record));
    workspace.scope = { kind: 'user', userId: 'another', workspaceId: 'other' };
    vi.mocked(getSavedTable).mockResolvedValue(null);
    rerender();
    expect(result.current).toBeNull();
    await waitFor(() => expect(getSavedTable).toHaveBeenCalledWith(target, workspace.scope));
    unmount();
    queryClient.clear();
  });
});
