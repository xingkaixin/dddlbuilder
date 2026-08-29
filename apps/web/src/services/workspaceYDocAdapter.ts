import {
  savedTableReference,
  savedTableKey,
  type SavedTableTarget,
} from '@ddlbuilder/shared-types/workspace';
import type * as Y from 'yjs';
import {
  type PersistedState,
  type EditorSessionState,
  type SchemaDocumentState,
  withEditorSession,
  withDefaultEditorSession,
} from '@ddlbuilder/shared-types';
import type {
  SavedTableDraftRecord,
  WorkspaceSelection,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import {
  type ApplySchemaDocumentStateOptions,
  applySchemaDocumentStateToTableDoc,
  deleteWorkspaceDraft,
  deleteWorkspaceFolder,
  deleteWorkspaceSavedDraft,
  deleteWorkspaceSavedTable,
  ensureWorkspaceYDocMeta,
  exportWorkspaceYDocToSnapshot,
  getDraftRecordFromYDoc as getSchemaDraftRecordFromYDoc,
  getWorkspaceSavedDraft,
  getWorkspaceSavedTable,
  renameWorkspaceSavedTable,
  renameWorkspaceSavedDraft,
  getWorkspaceSourceState,
  importWorkspaceSnapshotToYDoc,
  initializeOrMigrateWorkspaceYDoc,
  isWorkspaceYDocEmpty,
  listWorkspaceDrafts,
  listWorkspaceFolders,
  listWorkspaceSavedDrafts,
  listWorkspaceSavedTables,
  listWorkspaceTrashedDrafts,
  listWorkspaceTrashedSavedTables,
  materializeWorkspaceYDoc,
  mergeWorkspaceSnapshotIntoYDoc,
  subscribeWorkspaceYDoc,
  upsertWorkspaceDraft,
  upsertWorkspaceFolder,
  upsertWorkspaceSavedDraft,
  upsertWorkspaceSavedTable,
  WORKSPACE_YDOC_SCHEMA_VERSION,
  type WorkspaceYDocChange,
  type WorkspaceYDocCollection,
  type WorkspaceYDocDraftRecord as SchemaWorkspaceYDocDraftRecord,
} from '@ddlbuilder/workspace-core';
import type {
  SavedTableMetadata,
  SavedTableRecord,
  TableFolder,
} from '@/utils/workspaceStorageTypes';
import { buildFolderTreeModel, type FolderTreeNode } from '@/utils/folderModel';
import { resolveSavedTableSnapshot } from './savedTableSnapshot';
import { resolveSavedTableId } from '@/utils/savedTableIdentity';

export {
  applySchemaDocumentStateToTableDoc,
  ensureWorkspaceYDocMeta,
  exportWorkspaceYDocToSnapshot,
  importWorkspaceSnapshotToYDoc,
  initializeOrMigrateWorkspaceYDoc,
  isWorkspaceYDocEmpty,
  materializeWorkspaceYDoc,
  mergeWorkspaceSnapshotIntoYDoc,
  subscribeWorkspaceYDoc,
  WORKSPACE_YDOC_SCHEMA_VERSION,
};
export type { WorkspaceYDocChange, WorkspaceYDocCollection };

export type WorkspaceYDocDraftRecord = Omit<SchemaWorkspaceYDocDraftRecord, 'state'> & {
  state: PersistedState;
};
type WorkspaceYDocDraftWriteRecord = Omit<SchemaWorkspaceYDocDraftRecord, 'state'> & {
  state: SchemaDocumentState;
};

export const WorkspaceYDocOrigin = {
  LocalEdit: 'workspace-local-edit',
  RemoteSync: 'workspace-remote-sync',
  RemoteMaterialize: 'workspace-remote-materialize',
} as const;

export const getDraftRecordFromYDoc = (
  doc: Y.Doc,
  draftId: string,
): WorkspaceYDocDraftRecord | null => {
  const record = getSchemaDraftRecordFromYDoc(doc, draftId);
  return record ? { ...record, state: withDefaultEditorSession(record.state) } : null;
};

export const upsertDraftInYDoc = (
  doc: Y.Doc,
  draftId: string,
  record: WorkspaceYDocDraftWriteRecord,
  options?: ApplySchemaDocumentStateOptions,
) => upsertWorkspaceDraft(doc, draftId, record, options);

export const deleteDraftFromYDoc = deleteWorkspaceDraft;

export const listDraftRecordsFromYDoc = (doc: Y.Doc) =>
  listWorkspaceDrafts(doc).map(({ draftId, record }) => ({
    draftId,
    record: { ...record, state: withDefaultEditorSession(record.state) },
  }));

export const listTrashedDraftRecordsFromYDoc = (doc: Y.Doc) =>
  listWorkspaceTrashedDrafts(doc).map(({ draftId, record }) => ({
    draftId,
    record: { ...record, state: withDefaultEditorSession(record.state) },
  }));

const toSavedTableRecord = (
  record: NonNullable<ReturnType<typeof getWorkspaceSavedTable>>,
): SavedTableRecord => ({
  ...record,
  state: withDefaultEditorSession(record.state),
});

export const upsertSavedTableInYDoc = (
  doc: Y.Doc,
  record: Omit<SavedTableRecord, 'state'> & { state: SchemaDocumentState },
  options?: ApplySchemaDocumentStateOptions,
) => upsertWorkspaceSavedTable(doc, { ...record, tableId: resolveSavedTableId(record) }, options);

export const renameSavedTableInYDoc = (
  doc: Y.Doc,
  previousName: string,
  record: SavedTableRecord,
) =>
  renameWorkspaceSavedTable(doc, previousName, { ...record, tableId: resolveSavedTableId(record) });

export const renameSavedDraftInYDoc = renameWorkspaceSavedDraft;

export const deleteSavedTableFromYDoc = deleteWorkspaceSavedTable;

export const getSavedTableFromYDoc = (
  doc: Y.Doc,
  normalizedName: SavedTableTarget,
): SavedTableRecord | null => {
  const record = getWorkspaceSavedTable(doc, normalizedName);
  return record ? toSavedTableRecord(record) : null;
};

export const listSavedTableRecordsFromYDoc = (doc: Y.Doc): SavedTableRecord[] =>
  listWorkspaceSavedTables(doc).map(toSavedTableRecord);

export const listTrashedSavedTableRecordsFromYDoc = (doc: Y.Doc): SavedTableRecord[] =>
  listWorkspaceTrashedSavedTables(doc).map(toSavedTableRecord);

const toSavedTableMetadata = (record: SavedTableRecord): SavedTableMetadata => ({
  tableId: resolveSavedTableId(record),
  normalizedName: record.normalizedName,
  name: record.name,
  dbType: record.state.dbType,
  fieldCount: record.state.rows.filter((row) => row.fieldName.trim()).length,
  folderId: record.folderId,
  trashedAt: record.trashedAt,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const listSavedTableMetadataFromYDoc = (doc: Y.Doc): SavedTableMetadata[] =>
  listSavedTableRecordsFromYDoc(doc).map(toSavedTableMetadata);

export const listTrashedSavedTableMetadataFromYDoc = (doc: Y.Doc): SavedTableMetadata[] =>
  listTrashedSavedTableRecordsFromYDoc(doc).map(toSavedTableMetadata);

export const upsertSavedDraftInYDoc = (
  doc: Y.Doc,
  target: SavedTableTarget,
  record: Omit<SavedTableDraftRecord, 'state'> & { state: SchemaDocumentState },
  options?: ApplySchemaDocumentStateOptions,
) => upsertWorkspaceSavedDraft(doc, { ...record, ...savedTableReference(target) }, options);

export const deleteSavedDraftFromYDoc = deleteWorkspaceSavedDraft;

export const getSavedDraftFromYDoc = (
  doc: Y.Doc,
  normalizedName: SavedTableTarget,
): SavedTableDraftRecord | null => {
  const record = getWorkspaceSavedDraft(doc, normalizedName);
  if (!record) return null;
  const { normalizedName: _normalizedName, ...savedDraft } = record;
  return { ...savedDraft, state: withDefaultEditorSession(savedDraft.state) };
};

export const listSavedDraftsFromYDoc = (doc: Y.Doc) =>
  new Map(
    listWorkspaceSavedDrafts(doc).map((record) => [
      savedTableKey(record),
      { ...record, state: withDefaultEditorSession(record.state) },
    ]),
  );

export const upsertFolderInYDoc = (doc: Y.Doc, folder: TableFolder) => {
  upsertWorkspaceFolder(doc, folder);
};

export const deleteFolderFromYDoc = deleteWorkspaceFolder;

export const listFoldersFromYDoc = (doc: Y.Doc): TableFolder[] => listWorkspaceFolders(doc);

export const buildFolderTreeFromYDoc = (doc: Y.Doc): FolderTreeNode[] =>
  buildFolderTreeModel(listFoldersFromYDoc(doc));

export const getStateForWorkspaceSource = (
  doc: Y.Doc,
  source: WorkspaceSource,
): SchemaDocumentState | null => getWorkspaceSourceState(doc, source);

export const getWorkspaceSnapshotFromYDoc = (
  doc: Y.Doc,
  source: WorkspaceSelection,
  editorSession: EditorSessionState,
): { source: WorkspaceSelection; state: PersistedState } | null => {
  if (source.kind === 'draft') {
    const state = getStateForWorkspaceSource(doc, source);
    return state ? { source, state: withEditorSession(state, editorSession) } : null;
  }

  const record = getSavedTableFromYDoc(doc, source);
  if (!record) return null;
  const snapshot = resolveSavedTableSnapshot(record, getSavedDraftFromYDoc(doc, source));
  return { ...snapshot, state: withEditorSession(snapshot.state, editorSession) };
};
