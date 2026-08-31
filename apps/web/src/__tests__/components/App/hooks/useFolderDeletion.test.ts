import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useAuthIdentity, type AuthIdentityState } from '@/auth/AuthSessionProvider';
import { useWorkspaceYDocDocument } from '@/providers/WorkspaceYDocProvider';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useFolders } from '@/hooks/useFolders';
import { useFolderActions } from '@/components/App/hooks/useFolderActions';
import { useTabLifecycle } from '@/components/App/hooks/useTabLifecycle';
import { useSavedTablesFilter } from '@/components/App/saved-tables/useSavedTablesFilter';
import { useEditorStore, useTabStore } from '@/stores';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import {
  getDraftRecordFromYDoc,
  getSavedTableFromYDoc,
  upsertDraftInYDoc,
  upsertFolderInYDoc,
  upsertSavedTableInYDoc,
} from '@/services/workspaceYDocAdapter';
import { bulkPutFolders } from '@/utils/tableFolders';
import { addSavedTable, getSavedTable } from '@/utils/savedTablesDb';
import { readDraft, writeDraft } from '@/utils/workspaceStateDb';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';

vi.mock('@/auth/AuthSessionProvider', () => ({ useAuthIdentity: vi.fn() }));
vi.mock('@/providers/WorkspaceYDocProvider', () => ({ useWorkspaceYDocDocument: vi.fn() }));

const signedOutIdentity: AuthIdentityState = {
  status: 'signed_out',
  configured: true,
  userId: null,
  workspaceId: null,
  workspaceScope: null,
  email: null,
  name: null,
  emailVerified: false,
};
const anonymousScope = getAnonymousWorkspaceScope();
const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexes: [],
  authInput: '',
  authObjects: [],
});
const getCurrentState = () => toPersistedState(useEditorStore.getState());

function useFolderWorkspace() {
  const persistence = usePersistedState();
  const folders = useFolders();
  const tableName = useEditorStore((state) => state.tableName);
  const lifecycle = useTabLifecycle({
    enabled: persistence.status.hydrated,
    activeTableName: tableName,
    getCurrentState,
    saveState: persistence.document.saveState,
    selectWorkspaceSnapshot: persistence.document.selectWorkspaceSnapshot,
    resolveWorkspaceSnapshot: persistence.document.resolveWorkspaceSnapshot,
    resetWorkspaceSelection: persistence.document.resetWorkspaceSelection,
  });
  const actions = useFolderActions({
    folderTree: folders.folderTree,
    savedTables: [],
    drafts: persistence.drafts,
    closeTab: lifecycle.closeTab,
    createFolder: folders.createFolder,
    renameFolder: folders.renameFolder,
    moveFolder: folders.moveFolder,
    deleteFolderAction: folders.deleteFolder,
    moveTableToFolder: vi.fn(),
    showToast: vi.fn(),
  });
  const { ungroupedItems } = useSavedTablesFilter({
    items: persistence.drafts.draftSummaries.map((draft) => ({
      ...draft,
      tableId: `draft:${draft.draftId}`,
      normalizedName: draft.draftId,
    })),
    folders: folders.folderTree,
    searchQuery: '',
  });
  return { ...persistence, folders, actions, ungroupedItems };
}

describe('目录删除的草稿闭环', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    vi.clearAllMocks();
    vi.mocked(useAuthIdentity).mockReturnValue(signedOutIdentity);
    vi.mocked(useWorkspaceYDocDocument).mockReturnValue({
      doc: null,
      scope: null,
      localSynced: true,
      retry: vi.fn(),
    });
    useTabStore.setState({ tabs: [], activeTabId: null });
    useEditorStore.getState().resetDocument();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    useTabStore.setState({ tabs: [], activeTabId: null });
    useEditorStore.getState().resetDocument();
    teardownFakeIndexedDB();
  });

  it.each(['indexeddb', 'ydoc'] as const)(
    '%s 删除父目录后同步回收站和标签，恢复草稿可在根目录找到',
    async (storage) => {
      const doc = storage === 'ydoc' ? new Y.Doc() : null;
      const folders = [
        { id: 'root', name: 'Root', order: 0, createdAt: 1, updatedAt: 1 },
        { id: 'child', name: 'Child', parentId: 'root', order: 0, createdAt: 1, updatedAt: 1 },
        { id: 'kept', name: 'Kept', order: 1, createdAt: 1, updatedAt: 1 },
      ];
      const drafts = [
        { draftId: 'survivor', folderId: 'kept', state: createState('survivor') },
        { draftId: 'default', folderId: 'root', state: createState('active') },
        { draftId: 'nested', folderId: 'child', state: createState('background') },
      ];
      const savedTable = {
        tableId: 'saved-child',
        normalizedName: 'saved_child',
        name: 'saved_child',
        folderId: 'child',
        createdAt: 1,
        updatedAt: 1,
        state: createState('saved_child'),
      };
      if (doc) {
        vi.mocked(useAuthIdentity).mockReturnValue({
          ...signedOutIdentity,
          status: 'signed_in',
          userId: 'user-1',
          workspaceId: 'workspace-1',
          workspaceScope: { kind: 'user', userId: 'user-1', workspaceId: 'workspace-1' },
        });
        vi.mocked(useWorkspaceYDocDocument).mockReturnValue({
          doc,
          scope: { kind: 'user', userId: 'user-1', workspaceId: 'workspace-1' },
          localSynced: true,
          retry: vi.fn(),
        });
        for (const folder of folders) upsertFolderInYDoc(doc, folder);
        upsertSavedTableInYDoc(doc, savedTable);
      } else {
        await bulkPutFolders(folders, anonymousScope);
        await addSavedTable(savedTable, anonymousScope);
      }
      for (const { draftId, ...draft } of drafts) {
        const record = { ...draft, createdAt: 1, updatedAt: 1 };
        if (doc) upsertDraftInYDoc(doc, draftId, record);
        else await writeDraft(draftId, record, anonymousScope);
        useTabStore.getState().addTab({
          title: draft.state.tableName,
          source: { kind: 'draft', draftId },
          stateSnapshot: draftId === 'survivor' ? createState('stale_survivor') : draft.state,
        });
      }
      const activeTab = useTabStore
        .getState()
        .findTabBySource({ kind: 'draft', draftId: 'default' });
      if (!activeTab) throw new Error('活动草稿标签缺失');
      useTabStore.getState().activateTab(activeTab.id);
      useEditorStore.getState().replaceDocument(createState('active'));
      const { wrapper } = createQueryClientWrapper();
      const { result, unmount } = renderHook(useFolderWorkspace, { wrapper });
      const readStoredDraft = (draftId: string) =>
        doc ? getDraftRecordFromYDoc(doc, draftId) : readDraft(draftId, anonymousScope);

      try {
        await waitFor(() => expect(result.current.status.hydrated).toBe(true));
        await waitFor(() => expect(result.current.folders.folders).toHaveLength(3));
        const root = result.current.folders.folderTree.find((folder) => folder.id === 'root');
        if (!root) throw new Error('待删除目录缺失');
        const delayedSave = result.current.document.saveState;
        act(() => result.current.actions.handleOpenDeleteFolderDialog(root));
        await act(() => result.current.actions.handleDeleteFolderConfirm());

        expect(result.current.folders.folders.map((folder) => folder.id)).toEqual(['kept']);
        expect(result.current.drafts.draftSummaries.map((draft) => draft.draftId)).toEqual([
          'survivor',
        ]);
        expect(result.current.drafts.trashedDrafts.map((draft) => draft.draftId).sort()).toEqual([
          'default',
          'nested',
        ]);
        expect(useTabStore.getState().tabs.map((tab) => tab.source)).toEqual([
          { kind: 'draft', draftId: 'survivor' },
        ]);
        expect(result.current.document.activeSource).toEqual({
          kind: 'draft',
          draftId: 'survivor',
        });
        expect(useEditorStore.getState().tableName).toBe('survivor');
        expect(useEditorStore.getState().tableComment).toBe('');
        const trashedTable = doc
          ? getSavedTableFromYDoc(doc, savedTable)
          : await getSavedTable(savedTable, anonymousScope);
        expect(trashedTable?.trashedAt).toEqual(expect.any(Number));

        await act(async () => {
          delayedSave({
            source: { kind: 'draft', draftId: 'default' },
            state: createState('late'),
          });
          result.current.document.saveState({
            source: result.current.document.activeSource,
            state: { ...getCurrentState(), tableComment: 'continued edit' },
          });
        });
        await waitFor(async () => {
          expect((await readStoredDraft('survivor'))?.state.tableComment).toBe('continued edit');
        });
        for (const [draftId, tableName] of [
          ['default', 'active'],
          ['nested', 'background'],
        ]) {
          expect(await readStoredDraft(draftId)).toMatchObject({
            trashedAt: expect.any(Number),
            state: { tableName },
          });
        }

        await act(() => result.current.drafts.restoreDraftById('default'));
        expect(result.current.drafts.getDraftState('default')?.tableName).toBe('active');
        expect(await readStoredDraft('default')).toMatchObject({ folderId: 'root' });
        expect(result.current.ungroupedItems.map((item) => item.normalizedName)).toEqual([
          'default',
        ]);
        expect(result.current.document.activeSource).toEqual({
          kind: 'draft',
          draftId: 'survivor',
        });
      } finally {
        unmount();
        doc?.destroy();
      }
    },
  );
});
