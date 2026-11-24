import * as Y from 'yjs';
import { fetchUpdates, IndexeddbPersistence } from 'y-indexeddb';
import { watchWorkspaceHistory } from '@/services/workspaceHistoryWatcher';
import { prepareLegacyWorkspaceSnapshot } from '@/services/workspaceMigrationService';
import {
  initializeOrMigrateWorkspaceYDoc,
  mergeWorkspaceSnapshotIntoYDoc,
} from '@/services/workspaceYDocAdapter';
import { WorkspaceYDocSyncClient } from '@/services/workspaceYDocSyncClient';
import { commitLegacyWorkspaceYDoc } from '@/services/workspaceYDocStorage';

export const workspaceYDocRuntime = {
  Y,
  fetchUpdates,
  IndexeddbPersistence,
  watchWorkspaceHistory,
  prepareLegacyWorkspaceSnapshot,
  initializeOrMigrateWorkspaceYDoc,
  mergeWorkspaceSnapshotIntoYDoc,
  WorkspaceYDocSyncClient,
  commitLegacyWorkspaceYDoc,
};

export type WorkspaceYDocRuntime = typeof workspaceYDocRuntime;
