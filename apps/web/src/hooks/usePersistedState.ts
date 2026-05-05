import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { buildShareStateQueryKey } from '@/queryKeys/share';
import { ShareApiError, getShareState } from '@/services/shareService';
import { buildWorkspaceContentHash } from '@/services/workspaceIncrementalSyncService';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import {
  deleteDraftFromYDoc,
  deleteSavedDraftFromYDoc,
  getSavedDraftFromYDoc,
  getSavedTableFromYDoc,
  getStateForWorkspaceSource,
  listDraftRecordsFromYDoc,
  listSavedDraftsFromYDoc,
  subscribeWorkspaceYDoc,
  upsertDraftInYDoc,
  upsertSavedDraftInYDoc,
} from '@/services/workspaceYDocAdapter';
import type {
  DraftSummary,
  SavedTableDraftRecord,
  WorkspaceSavePayload,
  WorkspaceScope,
  WorkspaceSource,
} from '@ddlbuilder/shared-types/workspace';
import {
  clearWorkspaceSession,
  DEFAULT_DRAFT_ID,
  deleteDraft,
  deleteSavedDraft,
  listSavedDrafts,
  listTrashedDrafts,
  readDraft,
  renameSavedDraftKey,
  restoreDraft,
  upsertSavedDraft,
  writeDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';
import { enqueueWorkspaceOutboxItem } from '@/utils/workspaceSyncStateDb';
import type { SavedTableRecord } from '@/utils/savedTablesDb';
import { getWorkspaceBootstrap } from './workspacePersistence/bootstrap';
import { resetWorkspaceBootstrapCache } from './workspacePersistence/bootstrap';
import { getAnonymousWorkspaceScope, setCurrentWorkspaceScope } from '@/utils/workspaceScope';
import {
  buildDraftSummary,
  isSameWorkspaceSource,
  normalizeGlobalDraftRecord,
  normalizePersistedState,
  normalizeWorkspaceSession,
  type GlobalDraftRecord,
} from './workspacePersistence/normalize';
import {
  buildShareStorageKey,
  fireAndForget,
  parseSharePath,
  readStorageJson,
  removeStorage,
  writeStorageJson,
} from './workspacePersistence/storage';

const SHARE_CACHE_GC_TIME_MS = 15 * 60 * 1000;

const sortDraftSummaries = (drafts: DraftSummary[]) =>
  [...drafts].sort((a, b) => b.createdAt - a.createdAt || a.draftId.localeCompare(b.draftId));

const pickInitialDraft = (drafts: Array<{ draftId: string; record: GlobalDraftRecord }>) =>
  drafts.find((draft) => draft.draftId === DEFAULT_DRAFT_ID) ??
  [...drafts].sort(
    (a, b) =>
      (b.record.createdAt ?? b.record.updatedAt) - (a.record.createdAt ?? a.record.updatedAt),
  )[0] ??
  null;

const isSamePersistedState = (left: PersistedState, right: PersistedState) =>
  JSON.stringify(left) === JSON.stringify(right);

type ShareLoadStatus = 'idle' | 'not_found' | 'error';

export interface UsePersistedStateReturn {
  persistedState: PersistedState | null;
  hydrated: boolean;
  saveState: (payload: WorkspaceSavePayload) => void;
  clearState: () => void;
  shareLoadStatus: ShareLoadStatus;
  isShareView: boolean;
  activeSource: WorkspaceSource;
  draftSummaries: DraftSummary[];
  /** @deprecated 使用 getDraftState */
  getGlobalDraftState: () => PersistedState | null;
  getDraftState: (draftId: string) => PersistedState | null;
  setWorkspaceSnapshot: (source: WorkspaceSource, state: PersistedState) => void;
  selectWorkspaceSnapshot: (source: WorkspaceSource, state: PersistedState) => void;
  createDraft: (draftId: string, state: PersistedState) => string;
  deleteDraftById: (draftId: string) => void;
  moveDraftToFolder: (draftId: string, folderId?: string) => void;
  getSavedTableDraft: (normalizedName: string) => SavedTableDraftRecord | null;
  removeSavedTableDraft: (normalizedName: string) => void;
  renameSavedTableDraft: (
    fromNormalizedName: string,
    toNormalizedName: string,
    nextTableName: string,
  ) => void;
  trashedDrafts: DraftSummary[];
  restoreDraftById: (draftId: string) => Promise<void>;
  permanentlyDeleteDraftById: (draftId: string) => void;
}

export function usePersistedState(): UsePersistedStateReturn {
  const authSession = useAuthSession();
  const workspaceYDoc = useWorkspaceYDoc();
  const queryClient = useQueryClient();
  const pathInfo = parseSharePath(window.location.pathname);
  const shareId = pathInfo.shareId;
  const shareStorageKey = shareId ? buildShareStorageKey(shareId) : null;
  const [hydrated, setHydrated] = useState(false);
  const [persistedState, setPersistedState] = useState<PersistedState | null>(null);
  const [shareLoadStatus, setShareLoadStatus] = useState<ShareLoadStatus>('idle');
  const [activeSource, setActiveSource] = useState<WorkspaceSource>({
    kind: 'draft',
    draftId: DEFAULT_DRAFT_ID,
  });
  const [draftSummaries, setDraftSummaries] = useState<DraftSummary[]>([]);
  const [trashedDrafts, setTrashedDrafts] = useState<DraftSummary[]>([]);

  const activeSourceRef = useRef<WorkspaceSource>({
    kind: 'draft',
    draftId: DEFAULT_DRAFT_ID,
  });
  const persistedStateRef = useRef<PersistedState | null>(null);
  const draftsRef = useRef<Map<string, GlobalDraftRecord>>(new Map());
  const savedTableDraftsRef = useRef<Map<string, SavedTableDraftRecord>>(new Map());

  const currentScope = useMemo<WorkspaceScope>(
    () =>
      authSession.status === 'signed_in' && authSession.userId
        ? {
            kind: 'user',
            userId: authSession.userId,
            ...(authSession.workspaceId ? { workspaceId: authSession.workspaceId } : {}),
          }
        : getAnonymousWorkspaceScope(),
    [authSession.status, authSession.userId, authSession.workspaceId],
  );
  const workspaceScopeReady =
    authSession.status !== 'loading' &&
    (authSession.status !== 'signed_in' || Boolean(authSession.workspaceId));
  const yDocReady = Boolean(
    !shareId &&
    workspaceYDoc.doc &&
    workspaceYDoc.localSynced &&
    currentScope.kind === 'user' &&
    currentScope.workspaceId,
  );
  const shouldWaitForYDocHydration = Boolean(
    !shareId &&
    currentScope.kind === 'user' &&
    currentScope.workspaceId &&
    !workspaceYDoc.localSynced,
  );

  const syncActiveSource = useCallback((source: WorkspaceSource) => {
    activeSourceRef.current = source;
    setActiveSource((prev) => (isSameWorkspaceSource(prev, source) ? prev : source));
  }, []);

  const setPersistedStateIfChanged = useCallback((nextState: PersistedState | null) => {
    setPersistedState((prevState) => {
      if (!prevState || !nextState) {
        return prevState === nextState ? prevState : nextState;
      }
      return isSamePersistedState(prevState, nextState) ? prevState : nextState;
    });
  }, []);

  useEffect(() => {
    persistedStateRef.current = persistedState;
  }, [persistedState]);

  const updateDrafts = useCallback(
    (drafts: Array<{ draftId: string; record: GlobalDraftRecord }>) => {
      const map = new Map<string, GlobalDraftRecord>();
      const summaries: DraftSummary[] = [];
      for (const { draftId, record } of drafts) {
        map.set(draftId, record);
        summaries.push(
          buildDraftSummary(
            draftId,
            record.state,
            record.createdAt ?? record.updatedAt,
            record.updatedAt,
            record.folderId,
          ),
        );
      }
      draftsRef.current = map;
      setDraftSummaries(sortDraftSummaries(summaries));
    },
    [],
  );

  const getDraftState = useCallback((draftId: string) => {
    return draftsRef.current.get(draftId)?.state ?? null;
  }, []);

  const getSavedTableDraft = useCallback((normalizedName: string) => {
    return savedTableDraftsRef.current.get(normalizedName) ?? null;
  }, []);

  /** @deprecated 使用 getDraftState */
  const getGlobalDraftState = useCallback(() => {
    return getDraftState(DEFAULT_DRAFT_ID);
  }, [getDraftState]);

  const enqueueEntityChange = useCallback(
    (
      input:
        | {
            entityType: 'draft' | 'saved_table' | 'saved_draft' | 'folder';
            entityId: string;
            op: 'upsert';
            payload: unknown;
          }
        | {
            entityType: 'draft' | 'saved_table' | 'saved_draft' | 'folder';
            entityId: string;
            op: 'delete';
          },
    ) => {
      if (yDocReady) return;
      if (currentScope.kind !== 'user' || !currentScope.workspaceId) return;
      const workspaceId = currentScope.workspaceId;
      fireAndForget(
        (async () => {
          const payload = input.op === 'upsert' ? input.payload : null;
          await enqueueWorkspaceOutboxItem({
            workspaceId,
            entityType: input.entityType,
            entityId: input.entityId,
            op: input.op,
            payload,
            contentHash: input.op === 'upsert' ? await buildWorkspaceContentHash(payload) : null,
          });
        })(),
      );
    },
    [currentScope, yDocReady],
  );

  const setWorkspaceSnapshot = useCallback(
    (source: WorkspaceSource, state: PersistedState) => {
      if (shareId) return;

      syncActiveSource(source);
      setPersistedState(state);

      if (source.kind === 'draft') {
        const existingRecord = draftsRef.current.get(source.draftId);
        const contentChanged =
          !existingRecord || !isSamePersistedState(existingRecord.state, state);
        const draftRecord: GlobalDraftRecord = {
          createdAt: existingRecord?.createdAt ?? Date.now(),
          updatedAt: contentChanged ? Date.now() : existingRecord.updatedAt,
          state,
          folderId: existingRecord?.folderId,
        };
        if (contentChanged) {
          draftsRef.current.set(source.draftId, draftRecord);
          setDraftSummaries((prev) => {
            const next = prev.filter((d) => d.draftId !== source.draftId);
            const previousSummary = prev.find((d) => d.draftId === source.draftId);
            next.push(
              buildDraftSummary(
                source.draftId,
                state,
                previousSummary?.createdAt ?? draftRecord.createdAt ?? draftRecord.updatedAt,
                draftRecord.updatedAt,
                previousSummary?.folderId,
              ),
            );
            return sortDraftSummaries(next);
          });
          fireAndForget(writeDraft(source.draftId, draftRecord, currentScope));
          if (yDocReady && workspaceYDoc.doc) {
            const doc = workspaceYDoc.doc;
            doc.transact(() => {
              upsertDraftInYDoc(doc, source.draftId, draftRecord);
            });
          }
          enqueueEntityChange({
            entityType: 'draft',
            entityId: source.draftId,
            op: 'upsert',
            payload: {
              state,
              createdAt: draftRecord.createdAt,
              folderId: draftRecord.folderId,
            },
          });
        }
      }

      fireAndForget(
        writeWorkspaceSession(
          {
            activeSource: source,
            activeState: state,
            updatedAt: Date.now(),
          },
          currentScope,
        ),
      );
    },
    [currentScope, enqueueEntityChange, shareId, syncActiveSource, workspaceYDoc.doc, yDocReady],
  );

  const selectWorkspaceSnapshot = useCallback(
    (source: WorkspaceSource, state: PersistedState) => {
      if (shareId) return;

      syncActiveSource(source);
      setPersistedStateIfChanged(state);
      fireAndForget(
        writeWorkspaceSession(
          {
            activeSource: source,
            activeState: state,
            updatedAt: Date.now(),
          },
          currentScope,
        ),
      );
    },
    [currentScope, setPersistedStateIfChanged, shareId, syncActiveSource],
  );

  const saveState = useCallback(
    (payload: WorkspaceSavePayload) => {
      if (!hydrated) return;

      if (shareStorageKey) {
        writeStorageJson(shareStorageKey, payload.state);
        setPersistedState(payload.state);
        return;
      }

      const currentSource = activeSourceRef.current;
      if (!isSameWorkspaceSource(payload.source, currentSource)) {
        return;
      }

      if (payload.source.kind === 'draft') {
        const { draftId } = payload.source;
        const existingRecord = draftsRef.current.get(draftId);
        const contentChanged =
          !existingRecord || !isSamePersistedState(existingRecord.state, payload.state);
        const draftRecord: GlobalDraftRecord = {
          createdAt: existingRecord?.createdAt ?? Date.now(),
          updatedAt: contentChanged ? Date.now() : existingRecord.updatedAt,
          state: payload.state,
          folderId: existingRecord?.folderId,
        };
        if (contentChanged) {
          draftsRef.current.set(draftId, draftRecord);
          setDraftSummaries((prev) => {
            const next = prev.filter((d) => d.draftId !== draftId);
            const previousSummary = prev.find((d) => d.draftId === draftId);
            next.push(
              buildDraftSummary(
                draftId,
                payload.state,
                previousSummary?.createdAt ?? draftRecord.createdAt ?? draftRecord.updatedAt,
                draftRecord.updatedAt,
                previousSummary?.folderId,
              ),
            );
            return sortDraftSummaries(next);
          });
          fireAndForget(writeDraft(draftId, draftRecord, currentScope));
          if (yDocReady && workspaceYDoc.doc) {
            const doc = workspaceYDoc.doc;
            doc.transact(() => {
              upsertDraftInYDoc(doc, draftId, draftRecord);
            });
          }
          enqueueEntityChange({
            entityType: 'draft',
            entityId: draftId,
            op: 'upsert',
            payload: {
              state: payload.state,
              createdAt: draftRecord.createdAt,
              folderId: draftRecord.folderId,
            },
          });
        }
      }

      if (payload.source.kind === 'saved_table') {
        const { normalizedName, tableName, baseSignature } = payload.source;
        if (payload.isDirty) {
          const existingDraft = savedTableDraftsRef.current.get(normalizedName);
          const contentChanged =
            !existingDraft || !isSamePersistedState(existingDraft.state, payload.state);
          const record: SavedTableDraftRecord = {
            state: payload.state,
            tableName,
            baseSignature,
            updatedAt: contentChanged ? Date.now() : existingDraft.updatedAt,
          };
          if (contentChanged) {
            savedTableDraftsRef.current.set(normalizedName, record);
            fireAndForget(upsertSavedDraft(normalizedName, record, currentScope));
            if (yDocReady && workspaceYDoc.doc) {
              const doc = workspaceYDoc.doc;
              doc.transact(() => {
                upsertSavedDraftInYDoc(doc, normalizedName, record);
              });
            }
            enqueueEntityChange({
              entityType: 'saved_draft',
              entityId: normalizedName,
              op: 'upsert',
              payload: {
                tableName,
                state: payload.state,
                baseSignature,
              },
            });
          }
        } else {
          if (savedTableDraftsRef.current.has(normalizedName)) {
            savedTableDraftsRef.current.delete(normalizedName);
            fireAndForget(deleteSavedDraft(normalizedName, currentScope));
            if (yDocReady && workspaceYDoc.doc) {
              const doc = workspaceYDoc.doc;
              doc.transact(() => {
                deleteSavedDraftFromYDoc(doc, normalizedName);
              });
            }
            enqueueEntityChange({
              entityType: 'saved_draft',
              entityId: normalizedName,
              op: 'delete',
            });
          }
        }
      }

      const activeStateToPersist = payload.state;

      fireAndForget(
        writeWorkspaceSession(
          {
            activeSource: payload.source,
            activeState: activeStateToPersist,
            updatedAt: Date.now(),
          },
          currentScope,
        ),
      );
      syncActiveSource(payload.source);
    },
    [
      currentScope,
      enqueueEntityChange,
      hydrated,
      shareStorageKey,
      syncActiveSource,
      workspaceYDoc.doc,
      yDocReady,
    ],
  );

  const clearState = useCallback(() => {
    if (shareStorageKey) {
      removeStorage(shareStorageKey);
      setPersistedState(null);
      return;
    }

    if (activeSource.kind === 'draft') {
      draftsRef.current.delete(activeSource.draftId);
      setDraftSummaries((prev) => prev.filter((d) => d.draftId !== activeSource.draftId));
      fireAndForget(deleteDraft(activeSource.draftId, currentScope));
      if (yDocReady && workspaceYDoc.doc) {
        const doc = workspaceYDoc.doc;
        doc.transact(() => {
          deleteDraftFromYDoc(doc, activeSource.draftId);
        });
      }
    }

    syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
    fireAndForget(clearWorkspaceSession(currentScope));
    setPersistedState(null);
  }, [activeSource, currentScope, shareStorageKey, syncActiveSource, workspaceYDoc.doc, yDocReady]);

  const createDraft = useCallback(
    (draftId: string, state: PersistedState): string => {
      if (shareId) return state.tableName.trim() || '未命名草稿';

      const existingNames = new Set(
        Array.from(draftsRef.current.values()).map((r) => r.state.tableName.trim() || '未命名草稿'),
      );
      const baseName = state.tableName.trim() || '未命名草稿';
      let uniqueName = baseName;
      if (existingNames.has(uniqueName)) {
        let counter = 1;
        while (existingNames.has(`${uniqueName}_${counter}`)) {
          counter++;
        }
        uniqueName = `${uniqueName}_${counter}`;
      }

      const finalState = uniqueName !== baseName ? { ...state, tableName: uniqueName } : state;
      const now = Date.now();
      const draftRecord: GlobalDraftRecord = {
        createdAt: now,
        updatedAt: now,
        state: finalState,
      };
      draftsRef.current.set(draftId, draftRecord);
      setDraftSummaries((prev) => {
        const next = prev.filter((d) => d.draftId !== draftId);
        next.push(buildDraftSummary(draftId, finalState, now, now));
        return sortDraftSummaries(next);
      });
      fireAndForget(writeDraft(draftId, draftRecord, currentScope));
      if (yDocReady && workspaceYDoc.doc) {
        const doc = workspaceYDoc.doc;
        doc.transact(() => {
          upsertDraftInYDoc(doc, draftId, draftRecord);
        });
      }
      enqueueEntityChange({
        entityType: 'draft',
        entityId: draftId,
        op: 'upsert',
        payload: {
          state: finalState,
          createdAt: now,
        },
      });
      return uniqueName;
    },
    [currentScope, enqueueEntityChange, shareId, workspaceYDoc.doc, yDocReady],
  );

  const deleteDraftById = useCallback(
    (draftId: string) => {
      if (shareId) return;
      const record = draftsRef.current.get(draftId);
      if (!record) return;

      const trashedRecord: GlobalDraftRecord = {
        ...record,
        updatedAt: Date.now(),
        trashedAt: Date.now(),
      };
      draftsRef.current.delete(draftId);
      setDraftSummaries((prev) => prev.filter((d) => d.draftId !== draftId));
      setTrashedDrafts((prev) => [
        buildDraftSummary(
          draftId,
          trashedRecord.state,
          trashedRecord.createdAt ?? trashedRecord.updatedAt,
          trashedRecord.updatedAt,
          trashedRecord.folderId,
          trashedRecord.trashedAt,
        ),
        ...prev,
      ]);
      fireAndForget(writeDraft(draftId, trashedRecord, currentScope));
      if (yDocReady && workspaceYDoc.doc) {
        const doc = workspaceYDoc.doc;
        doc.transact(() => {
          deleteDraftFromYDoc(doc, draftId);
        });
      }
      enqueueEntityChange({
        entityType: 'draft',
        entityId: draftId,
        op: 'delete',
      });

      if (activeSourceRef.current.kind === 'draft' && activeSourceRef.current.draftId === draftId) {
        syncActiveSource({ kind: 'draft', draftId: DEFAULT_DRAFT_ID });
        fireAndForget(clearWorkspaceSession(currentScope));
        setPersistedState(null);
      }
    },
    [currentScope, enqueueEntityChange, shareId, syncActiveSource, workspaceYDoc.doc, yDocReady],
  );

  const restoreDraftById = useCallback(
    async (draftId: string) => {
      if (shareId) return;
      const record = await readDraft(draftId, currentScope);
      if (!record) return;

      // 命名冲突解决
      const existingNames = new Set(
        Array.from(draftsRef.current.values()).map((r) => r.state.tableName.trim() || '未命名草稿'),
      );
      const baseName = record.state.tableName.trim() || '未命名草稿';
      let uniqueName = baseName;
      if (existingNames.has(uniqueName)) {
        let counter = 1;
        while (existingNames.has(`${uniqueName}_${counter}`)) {
          counter++;
        }
        uniqueName = `${uniqueName}_${counter}`;
      }

      const restoredRecord: GlobalDraftRecord = {
        ...record,
        updatedAt: Date.now(),
        trashedAt: undefined,
      };
      if (uniqueName !== baseName) {
        restoredRecord.state = { ...restoredRecord.state, tableName: uniqueName };
      }

      setTrashedDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
      setDraftSummaries((prev) =>
        sortDraftSummaries([
          ...prev,
          buildDraftSummary(
            draftId,
            restoredRecord.state,
            restoredRecord.createdAt ?? restoredRecord.updatedAt,
            restoredRecord.updatedAt,
            restoredRecord.folderId,
          ),
        ]),
      );
      draftsRef.current.set(draftId, restoredRecord);
      await restoreDraft(draftId, restoredRecord, currentScope);
      if (yDocReady && workspaceYDoc.doc) {
        const doc = workspaceYDoc.doc;
        doc.transact(() => {
          upsertDraftInYDoc(doc, draftId, restoredRecord);
        });
      }
      enqueueEntityChange({
        entityType: 'draft',
        entityId: draftId,
        op: 'upsert',
        payload: {
          state: restoredRecord.state,
          createdAt: restoredRecord.createdAt,
          folderId: restoredRecord.folderId,
        },
      });
    },
    [currentScope, enqueueEntityChange, shareId, workspaceYDoc.doc, yDocReady],
  );

  const permanentlyDeleteDraftById = useCallback(
    (draftId: string) => {
      if (shareId) return;
      setTrashedDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
      fireAndForget(deleteDraft(draftId, currentScope));
      if (yDocReady && workspaceYDoc.doc) {
        const doc = workspaceYDoc.doc;
        doc.transact(() => {
          deleteDraftFromYDoc(doc, draftId);
        });
      }
      enqueueEntityChange({
        entityType: 'draft',
        entityId: draftId,
        op: 'delete',
      });
    },
    [currentScope, enqueueEntityChange, shareId, workspaceYDoc.doc, yDocReady],
  );

  const moveDraftToFolder = useCallback(
    (draftId: string, folderId?: string) => {
      if (shareId) return;
      const record = draftsRef.current.get(draftId);
      if (!record) return;
      const nextRecord: GlobalDraftRecord = {
        ...record,
        folderId,
        updatedAt: Date.now(),
      };
      draftsRef.current.set(draftId, nextRecord);
      setDraftSummaries((prev) =>
        prev.map((draft) => (draft.draftId === draftId ? { ...draft, folderId } : draft)),
      );
      fireAndForget(writeDraft(draftId, nextRecord, currentScope));
      if (yDocReady && workspaceYDoc.doc) {
        const doc = workspaceYDoc.doc;
        doc.transact(() => {
          upsertDraftInYDoc(doc, draftId, nextRecord);
        });
      }
      enqueueEntityChange({
        entityType: 'draft',
        entityId: draftId,
        op: 'upsert',
        payload: {
          state: nextRecord.state,
          createdAt: nextRecord.createdAt,
          folderId,
        },
      });
    },
    [currentScope, enqueueEntityChange, shareId, workspaceYDoc.doc, yDocReady],
  );

  const removeSavedTableDraft = useCallback(
    (normalizedName: string) => {
      if (shareId) return;
      savedTableDraftsRef.current.delete(normalizedName);
      fireAndForget(deleteSavedDraft(normalizedName, currentScope));
      if (yDocReady && workspaceYDoc.doc) {
        const doc = workspaceYDoc.doc;
        doc.transact(() => {
          deleteSavedDraftFromYDoc(doc, normalizedName);
        });
      }
      enqueueEntityChange({
        entityType: 'saved_draft',
        entityId: normalizedName,
        op: 'delete',
      });
    },
    [currentScope, enqueueEntityChange, shareId, workspaceYDoc.doc, yDocReady],
  );

  const renameSavedTableDraft = useCallback(
    (fromNormalizedName: string, toNormalizedName: string, nextTableName: string) => {
      if (shareId) return;
      const record = savedTableDraftsRef.current.get(fromNormalizedName);
      if (record) {
        const nextRecord = {
          ...record,
          tableName: nextTableName,
          updatedAt: Date.now(),
        };
        savedTableDraftsRef.current.set(toNormalizedName, nextRecord);
        if (fromNormalizedName !== toNormalizedName) {
          savedTableDraftsRef.current.delete(fromNormalizedName);
        }
        if (yDocReady && workspaceYDoc.doc) {
          const doc = workspaceYDoc.doc;
          doc.transact(() => {
            upsertSavedDraftInYDoc(doc, toNormalizedName, nextRecord);
            if (fromNormalizedName !== toNormalizedName) {
              deleteSavedDraftFromYDoc(doc, fromNormalizedName);
            }
          });
        }
      }
      fireAndForget(
        renameSavedDraftKey(fromNormalizedName, toNormalizedName, nextTableName, currentScope),
      );
      if (record) {
        enqueueEntityChange({
          entityType: 'saved_draft',
          entityId: toNormalizedName,
          op: 'upsert',
          payload: {
            tableName: nextTableName,
            state: record.state,
            baseSignature: record.baseSignature,
          },
        });
        if (fromNormalizedName !== toNormalizedName) {
          enqueueEntityChange({
            entityType: 'saved_draft',
            entityId: fromNormalizedName,
            op: 'delete',
          });
        }
      }
    },
    [currentScope, enqueueEntityChange, shareId, workspaceYDoc.doc, yDocReady],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrateWithState = (state: PersistedState | null) => {
      if (cancelled) return;
      setPersistedState(state);
      setHydrated(true);
    };

    const hydrateYDocWorkspace = async () => {
      if (!workspaceYDoc.doc) return false;
      const doc = workspaceYDoc.doc;
      setCurrentWorkspaceScope(currentScope);

      savedTableDraftsRef.current = listSavedDraftsFromYDoc(doc);
      const allDrafts = listDraftRecordsFromYDoc(doc).map(({ draftId, record }) => ({
        draftId,
        record,
      }));
      updateDrafts(allDrafts);
      const initialDraft = pickInitialDraft(allDrafts);

      const trashed = await listTrashedDrafts(currentScope);
      if (cancelled) return true;
      setTrashedDrafts(
        trashed.map(({ draftId, record }) =>
          buildDraftSummary(
            draftId,
            record.state,
            record.createdAt ?? record.updatedAt,
            record.updatedAt,
            record.folderId,
            record.trashedAt,
          ),
        ),
      );

      const { session: sessionRaw } = await getWorkspaceBootstrap(currentScope);
      if (cancelled) return true;
      const session = normalizeWorkspaceSession(sessionRaw);
      if (!session) {
        syncActiveSource({ kind: 'draft', draftId: initialDraft?.draftId ?? DEFAULT_DRAFT_ID });
        hydrateWithState(initialDraft?.record.state ?? null);
        return true;
      }

      if (session.activeSource.kind === 'saved_table') {
        const savedTable = getSavedTableFromYDoc(doc, session.activeSource.normalizedName);
        if (savedTable) {
          const savedDraft = getSavedDraftFromYDoc(doc, savedTable.normalizedName);
          const baseSignature =
            session.activeSource.baseSignature || JSON.stringify(savedTable.state) || '';
          syncActiveSource({
            kind: 'saved_table',
            normalizedName: savedTable.normalizedName,
            tableName: savedTable.name,
            baseSignature,
          });
          hydrateWithState(savedDraft?.state ?? session.activeState ?? savedTable.state);
          return true;
        }

        syncActiveSource({ kind: 'draft', draftId: initialDraft?.draftId ?? DEFAULT_DRAFT_ID });
        hydrateWithState(initialDraft?.record.state ?? null);
        return true;
      }

      const draftId = session.activeSource.draftId;
      const sessionDraft = allDrafts.find((draft) => draft.draftId === draftId);
      const resolvedDraft = sessionDraft ?? initialDraft;
      syncActiveSource({ kind: 'draft', draftId: resolvedDraft?.draftId ?? draftId });
      hydrateWithState(resolvedDraft?.record.state ?? session.activeState ?? null);
      return true;
    };

    const hydrateMainWorkspace = async () => {
      if (yDocReady && (await hydrateYDocWorkspace())) {
        return;
      }

      setCurrentWorkspaceScope(currentScope);

      const {
        globalDraft: globalDraftRaw,
        drafts: draftsRaw,
        session: sessionRaw,
        savedTable,
      } = await getWorkspaceBootstrap(currentScope);
      const savedDrafts = await listSavedDrafts(currentScope);
      savedTableDraftsRef.current = new Map(Object.entries(savedDrafts));

      const allDrafts: Array<{ draftId: string; record: GlobalDraftRecord }> = [];
      const defaultDraftRecord = normalizeGlobalDraftRecord(globalDraftRaw);
      if (defaultDraftRecord) {
        allDrafts.push({
          draftId: DEFAULT_DRAFT_ID,
          record: defaultDraftRecord,
        });
      }
      // 收集其他草稿（未来多草稿阶段使用）
      if (Array.isArray(draftsRaw)) {
        for (const item of draftsRaw) {
          if (
            item &&
            typeof item.draftId === 'string' &&
            item.draftId !== DEFAULT_DRAFT_ID &&
            item.record &&
            typeof item.record === 'object'
          ) {
            const record = normalizeGlobalDraftRecord(item.record);
            if (record) {
              allDrafts.push({ draftId: item.draftId, record });
            }
          }
        }
      }
      updateDrafts(allDrafts);
      const initialDraft = pickInitialDraft(allDrafts);

      const trashed = await listTrashedDrafts(currentScope);
      setTrashedDrafts(
        trashed.map(({ draftId, record }) =>
          buildDraftSummary(
            draftId,
            record.state,
            record.createdAt ?? record.updatedAt,
            record.updatedAt,
            record.folderId,
            record.trashedAt,
          ),
        ),
      );

      const session = normalizeWorkspaceSession(sessionRaw);

      if (!session) {
        syncActiveSource({ kind: 'draft', draftId: initialDraft?.draftId ?? DEFAULT_DRAFT_ID });
        hydrateWithState(initialDraft?.record.state ?? null);
        return;
      }

      if (session.activeSource.kind === 'saved_table') {
        if (savedTable) {
          const st = savedTable as SavedTableRecord;
          const baseSignature =
            session.activeSource.baseSignature ||
            (typeof (st as { stateSignature?: unknown }).stateSignature === 'string'
              ? (st as { stateSignature?: string }).stateSignature
              : JSON.stringify(st.state)) ||
            '';
          syncActiveSource({
            kind: 'saved_table',
            normalizedName: st.normalizedName,
            tableName: st.name ?? '',
            baseSignature,
          });
          hydrateWithState(session.activeState ?? st.state);
          return;
        }

        syncActiveSource({ kind: 'draft', draftId: initialDraft?.draftId ?? DEFAULT_DRAFT_ID });
        hydrateWithState(initialDraft?.record.state ?? null);
        return;
      }

      // 兼容旧 global_draft session，迁移为 draft
      const draftId =
        session.activeSource.kind === 'draft' ? session.activeSource.draftId : DEFAULT_DRAFT_ID;
      const sessionDraft = allDrafts.find((draft) => draft.draftId === draftId);
      const resolvedDraft = sessionDraft ?? initialDraft;
      syncActiveSource({ kind: 'draft', draftId: resolvedDraft?.draftId ?? draftId });
      if (session.activeState) {
        hydrateWithState(resolvedDraft?.record.state ?? session.activeState);
      } else {
        hydrateWithState(resolvedDraft?.record.state ?? null);
      }
    };

    const redirectHome = () => {
      window.history.replaceState({}, '', '/');
    };

    if (pathInfo.invalid) {
      setShareLoadStatus('error');
      redirectHome();
      void hydrateMainWorkspace();
      return () => {
        cancelled = true;
      };
    }

    if (!shareId || !shareStorageKey) {
      if (!workspaceScopeReady || shouldWaitForYDocHydration) {
        return () => {
          cancelled = true;
        };
      }
      void hydrateMainWorkspace();
      return () => {
        cancelled = true;
      };
    }

    const cachedShareState = normalizePersistedState(readStorageJson<unknown>(shareStorageKey));
    if (cachedShareState) {
      hydrateWithState(cachedShareState);
    }

    queryClient
      .fetchQuery({
        queryKey: buildShareStateQueryKey(shareId),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: SHARE_CACHE_GC_TIME_MS,
        queryFn: () => getShareState(shareId),
      })
      .then((state) => {
        hydrateWithState(state);
        writeStorageJson(shareStorageKey, state);
      })
      .catch((error) => {
        if (error instanceof ShareApiError && error.code === 'SHARE_NOT_FOUND') {
          setShareLoadStatus('not_found');
        } else {
          setShareLoadStatus('error');
        }
        redirectHome();
        void hydrateMainWorkspace();
      });

    return () => {
      cancelled = true;
    };
  }, [
    pathInfo.invalid,
    queryClient,
    shareId,
    shareStorageKey,
    currentScope,
    syncActiveSource,
    updateDrafts,
    shouldWaitForYDocHydration,
    workspaceScopeReady,
    workspaceYDoc.doc,
    yDocReady,
  ]);

  useEffect(() => {
    if (!yDocReady || !workspaceYDoc.doc) {
      return;
    }

    const doc = workspaceYDoc.doc;
    const refreshFromYDoc = () => {
      const allDrafts = listDraftRecordsFromYDoc(doc).map(({ draftId, record }) => ({
        draftId,
        record,
      }));
      updateDrafts(allDrafts);
      savedTableDraftsRef.current = listSavedDraftsFromYDoc(doc);

      const source = activeSourceRef.current;
      if (source.kind === 'saved_table') {
        const savedDraft = getSavedDraftFromYDoc(doc, source.normalizedName);
        const savedTable = getSavedTableFromYDoc(doc, source.normalizedName);
        const nextState = savedDraft?.state ?? savedTable?.state ?? null;
        if (nextState) {
          setPersistedStateIfChanged(nextState);
          return;
        }
      } else {
        const nextState = getStateForWorkspaceSource(doc, source);
        if (nextState) {
          setPersistedStateIfChanged(nextState);
          return;
        }
      }

      if (!persistedStateRef.current) {
        const initialDraft = pickInitialDraft(allDrafts);
        if (initialDraft) {
          syncActiveSource({ kind: 'draft', draftId: initialDraft.draftId });
          setPersistedStateIfChanged(initialDraft.record.state);
          return;
        }
      }

      if (source.kind === 'draft') {
        setPersistedStateIfChanged(null);
        return;
      }
    };

    const unsubscribe = subscribeWorkspaceYDoc(doc, refreshFromYDoc);
    refreshFromYDoc();
    return unsubscribe;
  }, [setPersistedStateIfChanged, syncActiveSource, updateDrafts, workspaceYDoc.doc, yDocReady]);

  useEffect(() => {
    if (shareId || !workspaceScopeReady || yDocReady) {
      return;
    }

    let cancelled = false;
    const handleSnapshotApplied = () => {
      void (async () => {
        setCurrentWorkspaceScope(currentScope);
        resetWorkspaceBootstrapCache();
        const {
          globalDraft: globalDraftRaw,
          drafts: draftsRaw,
          session: sessionRaw,
          savedTable,
        } = await getWorkspaceBootstrap(currentScope);
        const savedDrafts = await listSavedDrafts(currentScope);
        if (cancelled) return;
        savedTableDraftsRef.current = new Map(Object.entries(savedDrafts));

        const allDrafts: Array<{ draftId: string; record: GlobalDraftRecord }> = [];
        const defaultDraftRecord = normalizeGlobalDraftRecord(globalDraftRaw);
        if (defaultDraftRecord) {
          allDrafts.push({
            draftId: DEFAULT_DRAFT_ID,
            record: defaultDraftRecord,
          });
        }
        if (Array.isArray(draftsRaw)) {
          for (const item of draftsRaw) {
            if (
              item &&
              typeof item.draftId === 'string' &&
              item.draftId !== DEFAULT_DRAFT_ID &&
              item.record &&
              typeof item.record === 'object'
            ) {
              const record = normalizeGlobalDraftRecord(item.record);
              if (record) {
                allDrafts.push({ draftId: item.draftId, record });
              }
            }
          }
        }
        updateDrafts(allDrafts);
        const initialDraft = pickInitialDraft(allDrafts);
        const session = normalizeWorkspaceSession(sessionRaw);

        if (!session) {
          syncActiveSource({ kind: 'draft', draftId: initialDraft?.draftId ?? DEFAULT_DRAFT_ID });
          setPersistedStateIfChanged(initialDraft?.record.state ?? null);
          setHydrated(true);
          return;
        }

        if (session.activeSource.kind === 'saved_table' && savedTable) {
          const st = savedTable as SavedTableRecord;
          syncActiveSource({
            kind: 'saved_table',
            normalizedName: st.normalizedName,
            tableName: st.name ?? '',
            baseSignature:
              session.activeSource.baseSignature ||
              (typeof (st as { stateSignature?: unknown }).stateSignature === 'string'
                ? (st as { stateSignature?: string }).stateSignature
                : JSON.stringify(st.state)) ||
              '',
          });
          setPersistedStateIfChanged(session.activeState ?? st.state);
          setHydrated(true);
          return;
        }

        const draftId =
          session.activeSource.kind === 'draft' ? session.activeSource.draftId : DEFAULT_DRAFT_ID;
        const sessionDraft = allDrafts.find((draft) => draft.draftId === draftId);
        const resolvedDraft = sessionDraft ?? initialDraft;
        syncActiveSource({ kind: 'draft', draftId: resolvedDraft?.draftId ?? draftId });
        setPersistedStateIfChanged(resolvedDraft?.record.state ?? session.activeState ?? null);
        setHydrated(true);
      })();
    };

    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    };
  }, [
    shareId,
    currentScope,
    setPersistedStateIfChanged,
    syncActiveSource,
    updateDrafts,
    workspaceScopeReady,
    yDocReady,
  ]);

  return {
    persistedState,
    hydrated,
    saveState,
    clearState,
    shareLoadStatus,
    isShareView: Boolean(shareId),
    activeSource,
    draftSummaries,
    getGlobalDraftState,
    getDraftState,
    setWorkspaceSnapshot,
    selectWorkspaceSnapshot,
    createDraft,
    deleteDraftById,
    moveDraftToFolder,
    getSavedTableDraft,
    removeSavedTableDraft,
    renameSavedTableDraft,
    trashedDrafts,
    restoreDraftById,
    permanentlyDeleteDraftById,
  };
}
