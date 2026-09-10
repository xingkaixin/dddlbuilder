import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import { getWorkspaceRoot } from '@ddlbuilder/workspace-core';
import {
  deleteDraftFromYDoc,
  deleteSavedTableFromYDoc,
  upsertDraftInYDoc,
  upsertSavedTableInYDoc,
  updateSavedTableMetadataInYDoc,
  renameSavedTableInYDoc,
} from '@/services/workspaceYDocAdapter';
import { useSavedTables } from '@/hooks/useSavedTables';
import { useDraftRecords } from '@/hooks/workspacePersistence/useDraftRecords';
import { createSchemaDocumentState } from '@/__tests__/utils/testFactories';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';

const workspace = vi.hoisted(() => ({
  // SAFETY: the projection mock starts before a Y.Doc is mounted and later supplies one per test.
  doc: null as Y.Doc | null,
  localSynced: true,
}));
const scope = vi.hoisted(() => ({
  // SAFETY: the projection hook accepts the literal workspace scope discriminant.
  kind: 'user' as const,
  userId: 'user',
  workspaceId: 'workspace',
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- provide controlled Y.Doc projection state without mounting the provider.
vi.mock('@/providers/WorkspaceYDocProvider', () => ({ useWorkspaceYDocDocument: () => workspace }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- keep projection scope stable while testing local and synced branches.
vi.mock('@/hooks/useWorkspaceScope', () => ({ useWorkspaceScope: () => scope }));

afterEach(() => vi.restoreAllMocks());

it('updates draft projections without decoding untouched drafts', () => {
  const doc = new Y.Doc();

  const record = {
    state: withDefaultEditorSession(createSchemaDocumentState({ tableName: 'users' })),
    createdAt: 1,
    updatedAt: 1,
  };
  upsertDraftInYDoc(doc, 'first', record);
  upsertDraftInYDoc(doc, 'untouched', record);

  const { result, unmount } = renderHook(() =>
    useDraftRecords({
      disabled: false,
      yDoc: doc,
      enqueuePersistence: vi.fn(),
      storage: { kind: 'ydoc', scope, yDoc: doc, transact: (mutate) => mutate(doc) },
    }),
  );
  const untouched = getWorkspaceRoot(doc).drafts.get('untouched');

  if (!untouched) throw new Error('Expected a draft');
  const read = vi.spyOn(untouched, 'get');
  act(() =>
    upsertDraftInYDoc(doc, 'first', {
      ...record,
      state: createSchemaDocumentState({ tableName: 'renamed' }),
    }),
  );
  expect(result.current.draftSummaries.find((draft) => draft.draftId === 'first')?.name).toBe(
    'renamed',
  );
  expect(read).not.toHaveBeenCalledWith('stateSnapshot');
  act(() => upsertDraftInYDoc(doc, 'first', { ...record, trashedAt: 2 }));
  expect(result.current.trashedDrafts.map((draft) => draft.draftId)).toEqual(['first']);
  act(() => deleteDraftFromYDoc(doc, 'first'));
  expect(result.current.trashedDrafts).toEqual([]);
  act(() => upsertDraftInYDoc(doc, 'new', record));
  expect(result.current.draftSummaries.map((draft) => draft.draftId)).toContain('new');
  unmount();
  doc.destroy();
});

it('updates saved-table summaries through rename, trash, restore and deletion', () => {
  const doc = new Y.Doc();
  workspace.doc = doc;

  const record = {
    tableId: 'first',
    normalizedName: 'users',
    name: 'Users',
    state: withDefaultEditorSession(createSchemaDocumentState({ tableName: 'users' })),
    createdAt: 1,
    updatedAt: 1,
  };
  upsertSavedTableInYDoc(doc, record);
  upsertSavedTableInYDoc(doc, { ...record, tableId: 'untouched', normalizedName: 'other' });
  const { wrapper } = createQueryClientWrapper();
  const { result, unmount } = renderHook(() => useSavedTables(), { wrapper });
  const previous = result.current.savedTables.find((table) => table.tableId === 'untouched');
  const untouched = getWorkspaceRoot(doc).savedTables.get('untouched');

  if (!untouched) throw new Error('Expected a table');
  const read = vi.spyOn(untouched, 'get');
  act(() =>
    renameSavedTableInYDoc(doc, 'users', {
      ...record,
      name: 'Accounts',
      normalizedName: 'accounts',
    }),
  );
  expect(result.current.savedTables.find((table) => table.tableId === 'first')?.name).toBe(
    'Accounts',
  );
  expect(result.current.savedTables.find((table) => table.tableId === 'untouched')).toBe(previous);
  expect(read).not.toHaveBeenCalledWith('stateSnapshot');
  act(() => updateSavedTableMetadataInYDoc(doc, record, { trashedAt: 2, updatedAt: 2 }));
  expect(result.current.trashedTables.map((table) => table.tableId)).toEqual(['first']);
  act(() => updateSavedTableMetadataInYDoc(doc, record, { trashedAt: undefined, updatedAt: 3 }));
  expect(result.current.trashedTables).toEqual([]);
  expect(result.current.savedTables).toHaveLength(2);
  act(() => deleteSavedTableFromYDoc(doc, record));
  expect(result.current.savedTables.map((table) => table.tableId)).toEqual(['untouched']);
  unmount();
  doc.destroy();
});
