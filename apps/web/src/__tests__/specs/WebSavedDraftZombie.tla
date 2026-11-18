---- MODULE WebSavedDraftZombie ----
\* Formal model of Saved-Table Draft synchronization in `apps/web`:
\*   - apps/web/src/hooks/usePersistedState.ts:
\*       saveState, clearSavedTableDraft, selectWorkspaceSnapshot, setWorkspaceSnapshot, resetToDefaultDraft
\*   - apps/web/src/hooks/workspacePersistence/useSavedTableDraftRecords.ts:
\*       persistRecord, dropRecord
\*   - apps/web/src/hooks/workspacePersistence/useWorkspaceYDocSubscription.ts:
\*       refreshFromYDoc
\*
\* Run:
\*   everystate apps/web/src/__tests__/specs/WebSavedDraftZombie.tla
\*   everystate -config apps/web/src/__tests__/specs/WebSavedDraftZombieBroken.cfg apps/web/src/__tests__/specs/WebSavedDraftZombie.tla

EXTENDS Naturals

CONSTANTS
  ClearLastLocalSaveAndSyncYDoc \* TRUE = fixed implementation; FALSE = pre-fix mutation

States == {"v0", "v_dirty", "v1_remote"}
OptStates == States \cup {"NONE"}

VARIABLES
  yDocTable,
  yDocDraft,
  recordsRefDraft,
  editorState,
  activeBaseSig,
  lastLocalSave,
  queueOp,
  userDiscarded

vars == <<yDocTable, yDocDraft, recordsRefDraft, editorState, activeBaseSig,
          lastLocalSave, queueOp, userDiscarded>>

Init ==
  /\ yDocTable = "v0"
  /\ yDocDraft = "NONE"
  /\ recordsRefDraft = "NONE"
  /\ editorState = "v0"
  /\ activeBaseSig = "v0"
  /\ lastLocalSave = "NONE"
  /\ queueOp = "idle"
  /\ userDiscarded = FALSE

\* usePersistedState.ts:saveState + useSavedTableDraftRecords.ts:persistRecord
UserEditSavedTable ==
  /\ editorState = "v0"
  /\ queueOp \in {"idle", "dropping_idb"}
  /\ editorState' = "v_dirty"
  /\ lastLocalSave' = "v_dirty"
  /\ recordsRefDraft' = "v_dirty"
  /\ userDiscarded' = FALSE
  /\ IF ClearLastLocalSaveAndSyncYDoc
     THEN /\ yDocDraft' = "v_dirty"
          /\ UNCHANGED <<yDocTable, activeBaseSig, queueOp>>
     ELSE IF queueOp = "idle"
          THEN /\ yDocDraft' = "v_dirty"
               /\ UNCHANGED <<yDocTable, activeBaseSig, queueOp>>
          ELSE /\ queueOp' = "dropping_then_persist"
               /\ UNCHANGED <<yDocTable, yDocDraft, activeBaseSig>>

\* usePersistedState.ts:clearSavedTableDraft + selectWorkspaceSnapshot
UserDiscardDraft ==
  /\ yDocDraft = "v_dirty"
  /\ queueOp = "idle"
  /\ recordsRefDraft' = "NONE"
  /\ yDocDraft' = "NONE"
  /\ editorState' = yDocTable
  /\ activeBaseSig' = yDocTable
  /\ lastLocalSave' = (IF ClearLastLocalSaveAndSyncYDoc THEN "NONE" ELSE lastLocalSave)
  /\ queueOp' = (IF ClearLastLocalSaveAndSyncYDoc THEN "idle" ELSE "dropping_idb")
  /\ userDiscarded' = TRUE
  /\ UNCHANGED yDocTable

\* useSavedTableDraftRecords.ts queued IndexedDB cleanup completion
QueueFinish ==
  /\ queueOp \in {"dropping_idb", "dropping_then_persist"}
  /\ IF queueOp = "dropping_then_persist"
     THEN /\ yDocDraft' = "v_dirty"
          /\ queueOp' = "idle"
          /\ UNCHANGED <<yDocTable, recordsRefDraft, editorState, activeBaseSig, lastLocalSave, userDiscarded>>
     ELSE /\ queueOp' = "idle"
          /\ UNCHANGED <<yDocTable, yDocDraft, recordsRefDraft, editorState, activeBaseSig, lastLocalSave, userDiscarded>>

\* useWorkspaceYDocSubscription.ts:refreshFromYDoc on remote Saved Table metadata/schema update
RemoteTableMetadataOrStateTouch ==
  /\ LET syncedRecordsRef == yDocDraft
         resurrect == (yDocDraft = "NONE" /\ lastLocalSave # "NONE" /\ lastLocalSave # activeBaseSig)
     IN IF resurrect
        THEN /\ yDocDraft' = lastLocalSave
             /\ recordsRefDraft' = lastLocalSave
             /\ editorState' = lastLocalSave
             /\ UNCHANGED <<yDocTable, activeBaseSig, lastLocalSave, queueOp, userDiscarded>>
        ELSE /\ recordsRefDraft' = syncedRecordsRef
             /\ editorState' = (IF yDocDraft # "NONE" THEN yDocDraft ELSE yDocTable)
             /\ UNCHANGED <<yDocTable, yDocDraft, activeBaseSig, lastLocalSave, queueOp, userDiscarded>>

Next ==
  \/ UserEditSavedTable
  \/ UserDiscardDraft
  \/ QueueFinish
  \/ RemoteTableMetadataOrStateTouch

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ yDocTable \in States
  /\ yDocDraft \in OptStates
  /\ recordsRefDraft \in OptStates
  /\ editorState \in States
  /\ activeBaseSig \in States
  /\ lastLocalSave \in OptStates
  /\ queueOp \in {"idle", "dropping_idb", "dropping_then_persist"}
  /\ userDiscarded \in BOOLEAN

NoZombieDraftAfterDiscard ==
  userDiscarded => (yDocDraft = "NONE" /\ editorState = yDocTable)

CacheMatchesYDocWhenIdle ==
  (queueOp = "idle") => (recordsRefDraft = yDocDraft)
====
