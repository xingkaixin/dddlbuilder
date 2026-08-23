import * as Y from 'yjs';
import { type PersistedState, withDefaultEditorSession } from '@ddlbuilder/shared-types';
import type {
  SavedTableDraftRecord,
  WorkspaceSnapshot,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import {
  type ApplySchemaDocumentStateOptions,
  applySchemaDocumentStateToTableDoc,
  DEFAULT_DRAFT_ID,
  ensureWorkspaceYDocMeta,
  exportWorkspaceYDocToSnapshot as encodeWorkspaceSnapshot,
  getDraftRecordFromYDoc as getSchemaDraftRecordFromYDoc,
  getWorkspaceRoot,
  importWorkspaceSnapshotToYDoc as decodeWorkspaceSnapshot,
  isWorkspaceYDocEmpty,
  materializeWorkspaceYDoc,
  readFolderRecords,
  shouldAcceptSnapshotRecord,
  tableDocToSchemaDocumentState,
  tableMetadata,
  upsertTableRecord,
  WORKSPACE_YDOC_SCHEMA_VERSION,
  type WorkspaceYDocDraftRecord as SchemaWorkspaceYDocDraftRecord,
  writeFolderRecord,
} from '@ddlbuilder/workspace-core';
import type {
  SavedTableMetadata,
  SavedTableRecord,
  TableFolder,
} from '@/utils/workspaceStorageTypes';
import { buildFolderTreeModel, type FolderTreeNode } from '@/utils/folderModel';

export {
  applySchemaDocumentStateToTableDoc,
  ensureWorkspaceYDocMeta,
  isWorkspaceYDocEmpty,
  materializeWorkspaceYDoc,
  WORKSPACE_YDOC_SCHEMA_VERSION,
};

export type WorkspaceYDocDraftRecord = Omit<SchemaWorkspaceYDocDraftRecord, 'state'> & {
  state: PersistedState;
};

const readEditorState = (tableDoc: Y.Map<unknown>) =>
  withDefaultEditorSession(tableDocToSchemaDocumentState(tableDoc));

export const getDraftRecordFromYDoc = (
  doc: Y.Doc,
  draftId: string,
): WorkspaceYDocDraftRecord | null => {
  const record = getSchemaDraftRecordFromYDoc(doc, draftId);
  return record ? { ...record, state: withDefaultEditorSession(record.state) } : null;
};

export const WORKSPACE_YDOC_LOCAL_EDIT_ORIGIN = { source: 'workspace-local-edit' } as const;

export type WorkspaceYDocCollection = 'drafts' | 'savedTables' | 'savedDrafts' | 'folders';

export type WorkspaceYDocChange = {
  collection: WorkspaceYDocCollection;
  entityIds: ReadonlySet<string>;
  origin: unknown;
};

export const upsertDraftInYDoc = (
  doc: Y.Doc,
  draftId: string,
  record: WorkspaceYDocDraftRecord,
  options?: ApplySchemaDocumentStateOptions,
) => {
  upsertTableRecord(
    getWorkspaceRoot(doc).drafts,
    draftId,
    record.state,
    {
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      folderId: record.folderId,
    },
    options,
  );
};

export const deleteDraftFromYDoc = (doc: Y.Doc, draftId: string) => {
  getWorkspaceRoot(doc).drafts.delete(draftId);
};

export const listDraftRecordsFromYDoc = (doc: Y.Doc) =>
  Array.from(getWorkspaceRoot(doc).drafts.entries()).map(([draftId, tableDoc]) => ({
    draftId,
    record: getDraftRecordFromYDoc(doc, draftId) ?? {
      state: readEditorState(tableDoc),
      updatedAt: Date.now(),
    },
  }));

export const upsertSavedTableInYDoc = (
  doc: Y.Doc,
  record: SavedTableRecord,
  options?: ApplySchemaDocumentStateOptions,
) => {
  upsertTableRecord(
    getWorkspaceRoot(doc).savedTables,
    record.normalizedName,
    record.state,
    {
      normalizedName: record.normalizedName,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      folderId: record.folderId,
    },
    options,
  );
};

export const deleteSavedTableFromYDoc = (doc: Y.Doc, normalizedName: string) => {
  getWorkspaceRoot(doc).savedTables.delete(normalizedName);
};

export const getSavedTableFromYDoc = (
  doc: Y.Doc,
  normalizedName: string,
): SavedTableRecord | null => {
  const tableDoc = getWorkspaceRoot(doc).savedTables.get(normalizedName);
  if (!tableDoc) return null;
  const metadata = tableMetadata(tableDoc);
  const now = Date.now();
  return {
    normalizedName,
    name: typeof metadata.name === 'string' ? metadata.name : normalizedName,
    state: readEditorState(tableDoc),
    createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : now,
    updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : now,
    ...(typeof metadata.folderId === 'string' ? { folderId: metadata.folderId } : {}),
  };
};

export const listSavedTableRecordsFromYDoc = (doc: Y.Doc): SavedTableRecord[] =>
  Array.from(getWorkspaceRoot(doc).savedTables.keys())
    .map((normalizedName) => getSavedTableFromYDoc(doc, normalizedName))
    .filter((record): record is SavedTableRecord => record != null);

export const listSavedTableMetadataFromYDoc = (doc: Y.Doc): SavedTableMetadata[] =>
  listSavedTableRecordsFromYDoc(doc).map((record) => ({
    normalizedName: record.normalizedName,
    name: record.name,
    dbType: record.state.dbType,
    fieldCount: record.state.rows.filter((row) => row.fieldName.trim()).length,
    folderId: record.folderId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));

export const upsertSavedDraftInYDoc = (
  doc: Y.Doc,
  normalizedName: string,
  record: SavedTableDraftRecord,
  options?: ApplySchemaDocumentStateOptions,
) => {
  upsertTableRecord(
    getWorkspaceRoot(doc).savedDrafts,
    normalizedName,
    record.state,
    {
      normalizedName,
      tableName: record.tableName,
      baseSignature: record.baseSignature,
      updatedAt: record.updatedAt,
    },
    options,
  );
};

export const deleteSavedDraftFromYDoc = (doc: Y.Doc, normalizedName: string) => {
  getWorkspaceRoot(doc).savedDrafts.delete(normalizedName);
};

export const getSavedDraftFromYDoc = (
  doc: Y.Doc,
  normalizedName: string,
): SavedTableDraftRecord | null => {
  const tableDoc = getWorkspaceRoot(doc).savedDrafts.get(normalizedName);
  if (!tableDoc) return null;
  const metadata = tableMetadata(tableDoc);
  return {
    state: readEditorState(tableDoc),
    tableName: typeof metadata.tableName === 'string' ? metadata.tableName : normalizedName,
    baseSignature: typeof metadata.baseSignature === 'string' ? metadata.baseSignature : '',
    updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : Date.now(),
  };
};

export const listSavedDraftsFromYDoc = (doc: Y.Doc) => {
  const entries: Array<[string, SavedTableDraftRecord]> = [];
  for (const normalizedName of getWorkspaceRoot(doc).savedDrafts.keys()) {
    const record = getSavedDraftFromYDoc(doc, normalizedName);
    if (record) entries.push([normalizedName, record]);
  }
  return new Map(entries);
};

export const upsertFolderInYDoc = (doc: Y.Doc, folder: TableFolder) => {
  writeFolderRecord(doc, folder);
};

export const deleteFolderFromYDoc = (doc: Y.Doc, folderId: string) => {
  getWorkspaceRoot(doc).folders.delete(folderId);
};

export const listFoldersFromYDoc = (doc: Y.Doc): TableFolder[] => readFolderRecords(doc);

export const buildFolderTreeFromYDoc = (doc: Y.Doc): FolderTreeNode[] => {
  return buildFolderTreeModel(listFoldersFromYDoc(doc));
};

export const importWorkspaceSnapshotToYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  decodeWorkspaceSnapshot(doc, snapshot);
};

export const exportWorkspaceYDocToSnapshot = (doc: Y.Doc): WorkspaceSnapshot =>
  encodeWorkspaceSnapshot(doc);

export const mergeWorkspaceSnapshotIntoYDoc = (doc: Y.Doc, snapshot: WorkspaceSnapshot) => {
  const current = exportWorkspaceYDocToSnapshot(doc);
  const currentDrafts = new Map(current.drafts.map((draft) => [draft.draftId, draft]));
  const currentTables = new Map(current.savedTables.map((table) => [table.normalizedName, table]));
  const currentSavedDrafts = new Map(
    current.savedDrafts.map((draft) => [draft.normalizedName, draft]),
  );
  const currentFolders = new Set(current.folders.map((folder) => folder.id));
  const merged: WorkspaceSnapshot = {
    globalDraft: null,
    drafts: [],
    savedTables: [],
    savedDrafts: [],
    folders: [],
  };

  if (
    snapshot.globalDraft &&
    shouldAcceptSnapshotRecord(
      snapshot.globalDraft.updatedAt,
      currentDrafts.get(DEFAULT_DRAFT_ID)?.updatedAt,
    )
  ) {
    merged.globalDraft = snapshot.globalDraft;
  }

  for (const draft of snapshot.drafts) {
    if (shouldAcceptSnapshotRecord(draft.updatedAt, currentDrafts.get(draft.draftId)?.updatedAt)) {
      merged.drafts.push(draft);
    }
  }

  for (const table of snapshot.savedTables) {
    if (
      shouldAcceptSnapshotRecord(
        table.updatedAt,
        currentTables.get(table.normalizedName)?.updatedAt,
      )
    ) {
      merged.savedTables.push(table);
    }
  }

  for (const draft of snapshot.savedDrafts) {
    if (
      shouldAcceptSnapshotRecord(
        draft.updatedAt,
        currentSavedDrafts.get(draft.normalizedName)?.updatedAt,
      )
    ) {
      merged.savedDrafts.push(draft);
    }
  }

  for (const folder of snapshot.folders) {
    if (!currentFolders.has(folder.id)) {
      merged.folders.push(folder);
    }
  }

  if (
    merged.globalDraft ||
    merged.drafts.length > 0 ||
    merged.savedTables.length > 0 ||
    merged.savedDrafts.length > 0 ||
    merged.folders.length > 0
  ) {
    importWorkspaceSnapshotToYDoc(doc, merged);
  }
};

export const getStateForWorkspaceSource = (
  doc: Y.Doc,
  source: WorkspaceSource,
): PersistedState | null => {
  if (source.kind === 'draft') {
    return getDraftRecordFromYDoc(doc, source.draftId)?.state ?? null;
  }
  return getSavedTableFromYDoc(doc, source.normalizedName)?.state ?? null;
};

export const subscribeWorkspaceYDoc = (
  doc: Y.Doc,
  notify: (change: WorkspaceYDocChange) => void,
  collections: readonly WorkspaceYDocCollection[] = [
    'drafts',
    'savedTables',
    'savedDrafts',
    'folders',
  ],
) => {
  const roots = getWorkspaceRoot(doc);
  const subscriptions = collections.map((collection) => {
    const root = roots[collection];
    const handleChange = (
      events: Y.YEvent<Y.AbstractType<unknown>>[],
      transaction: Y.Transaction,
    ) => {
      const entityIds = new Set<string>();
      for (const event of events) {
        const entityId = event.path[0];
        if (typeof entityId === 'string') {
          entityIds.add(entityId);
          continue;
        }
        if (event instanceof Y.YMapEvent) {
          for (const key of event.changes.keys.keys()) {
            entityIds.add(key);
          }
        }
      }
      notify({ collection, entityIds, origin: transaction.origin });
    };
    root.observeDeep(handleChange);
    return { root, handleChange };
  });
  return () => {
    for (const { root, handleChange } of subscriptions) {
      root.unobserveDeep(handleChange);
    }
  };
};
