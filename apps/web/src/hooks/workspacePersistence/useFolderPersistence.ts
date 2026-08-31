import { useCallback } from 'react';
import {
  deleteFolderFromYDoc,
  listDraftRecordsFromYDoc,
  listFoldersFromYDoc,
  listSavedTableRecordsFromYDoc,
  upsertDraftInYDoc,
  upsertFolderInYDoc,
  upsertSavedTableInYDoc,
} from '@/services/workspaceYDocAdapter';
import { createFolder, deleteFolder, moveFolder, renameFolder } from '@/utils/tableFolders';
import {
  buildFolderDeletionPlan,
  createFolderRecord,
  moveFolderRecord,
  renameFolderRecord,
} from '@/utils/folderModel';
import { useWorkspaceAuthority } from './useWorkspaceAuthority';
import { requireReadyWorkspaceStorage } from './useWorkspaceStorageTarget';
import i18n from '@/i18n';

export function useFolderPersistence() {
  const authority = useWorkspaceAuthority();
  const { storage } = authority;

  const createFolderEntry = useCallback(
    async (name: string, parentId?: string) => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        return target.transact((doc) => {
          const folder = createFolderRecord(listFoldersFromYDoc(doc), name, parentId);
          upsertFolderInYDoc(doc, folder);
          return folder;
        });
      }
      return createFolder(name, target.scope, parentId);
    },
    [storage],
  );

  const renameFolderEntry = useCallback(
    async (id: string, newName: string) => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        target.transact((doc) => {
          const folder = listFoldersFromYDoc(doc).find((item) => item.id === id);
          if (!folder) throw new Error(i18n.t('savedTables.toast.folderNotFound'));
          upsertFolderInYDoc(doc, renameFolderRecord(folder, newName));
        });
        return;
      }
      await renameFolder(id, newName, target.scope);
    },
    [storage],
  );

  const deleteFolderTree = useCallback(
    async (id: string) => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        return target.transact((doc) => {
          const plan = buildFolderDeletionPlan(
            listFoldersFromYDoc(doc),
            [
              ...listSavedTableRecordsFromYDoc(doc),
              ...listDraftRecordsFromYDoc(doc).map(({ draftId, record }) => ({
                ...record,
                draftId,
              })),
            ],
            id,
          );
          for (const item of plan.itemsToTrash) {
            if ('draftId' in item) {
              const { draftId, ...record } = item;
              upsertDraftInYDoc(doc, draftId, record);
            } else {
              upsertSavedTableInYDoc(doc, item);
            }
          }
          for (const folderId of plan.folderIds) deleteFolderFromYDoc(doc, folderId);
          return plan.folderIds;
        });
      }
      return deleteFolder(id, target.scope);
    },
    [storage],
  );

  const moveFolderEntry = useCallback(
    async (id: string, newParentId?: string) => {
      const target = requireReadyWorkspaceStorage(storage);
      if (target.kind === 'ydoc') {
        target.transact((doc) => {
          const folder = moveFolderRecord(listFoldersFromYDoc(doc), id, newParentId);
          upsertFolderInYDoc(doc, folder);
        });
        return;
      }
      await moveFolder(id, target.scope, newParentId);
    },
    [storage],
  );

  return {
    ...authority,
    createFolderEntry,
    renameFolderEntry,
    deleteFolderTree,
    moveFolderEntry,
  };
}
