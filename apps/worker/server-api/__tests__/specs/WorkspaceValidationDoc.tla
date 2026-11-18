---- MODULE WorkspaceValidationDoc ----
\* Formal model of WorkspaceYDocDurableObject validationDoc synchronization
\* Source:
\*   - apps/worker/server-api/lib/workspaceYDocDurableObject.ts:
\*       validatedSocket = null (line 69)
\*       fetch POST /migrate (lines 169-178)
\*       webSocketMessage -> assertValidSyncMessage & readSyncMessage (lines 235-246)
\*       handleDocUpdate (lines 418-425):
\*         `if (this.validationDoc && origin !== this.validatedSocket) Y.applyUpdate(this.validationDoc, update);`
\*   - packages/workspace-core/src/workspaceYDocCodec.ts:
\*       importWorkspaceSnapshotToYDoc (line 23):
\*         `doc.transact(() => { ... })` -- omits origin, so Yjs passes `origin = null`!
\*
\* Promise: Outside the synchronous execution of `readSyncMessage` for an already-validated WebSocket frame,
\* `this.validationDoc` is always state-equivalent to `this.doc` so valid updates are accepted and
\* malformed child updates on migrated tables cannot bypass validation via Yjs pendingStructs.

EXTENDS Naturals

CONSTANTS
  DistinctIdleSentinel \* FALSE = current code (`validatedSocket` defaults to `null`, colliding with Yjs default `origin = null`);
                       \* TRUE  = fixed design (`validatedSocket` uses a distinct sentinel or `/migrate` passes explicit origin)

NoSocketSentinel == IF DistinctIdleSentinel THEN "NO_SOCKET" ELSE "NULL"

VARIABLES
  docTables,           \* set of tables present in `this.doc` (e.g. {"migrated_tbl", "ws_tbl"})
  validationDocTables, \* set of tables present in `this.validationDoc`
  corruptedSubMap,     \* set of tables in `this.doc` with malformed child entries (invalid structure)
  validatedSocket      \* current value of `this.validatedSocket`

vars == <<docTables, validationDocTables, corruptedSubMap, validatedSocket>>

Init ==
  /\ docTables = {}
  /\ validationDocTables = {}
  /\ corruptedSubMap = {}
  /\ validatedSocket = NoSocketSentinel

\* POST /migrate -> applyWorkspaceMigrationSnapshot -> importWorkspaceSnapshotToYDoc
\* Calls `doc.transact(() => ...)` with no origin (`origin = "NULL"`).
\* `handleDocUpdate` checks `origin !== this.validatedSocket`.
MigrateTable ==
  /\ "migrated_tbl" \notin docTables
  /\ LET origin == "NULL"
     IN /\ docTables' = docTables \cup {"migrated_tbl"}
        /\ validationDocTables' =
             IF origin # validatedSocket
             THEN validationDocTables \cup {"migrated_tbl"}
             ELSE validationDocTables
        /\ UNCHANGED <<corruptedSubMap, validatedSocket>>

\* Normal WebSocket message creating "ws_tbl":
\* 1. `assertValidSyncMessage` applies update to `validationDoc` and validates it.
\* 2. `this.validatedSocket = "ws1"`, `readSyncMessage` applies update to `doc` with `origin = "ws1"`,
\*    `handleDocUpdate` skips `validationDoc` because `origin === validatedSocket`, then resets `validatedSocket`.
WebSocketCreateValidTable ==
  /\ "ws_tbl" \notin docTables
  /\ validationDocTables' = validationDocTables \cup {"ws_tbl"}
  /\ docTables' = docTables \cup {"ws_tbl"}
  /\ validatedSocket' = NoSocketSentinel
  /\ UNCHANGED corruptedSubMap

\* Client sends a malformed child-map update targeting "migrated_tbl" (e.g. non-Y.Map entry inside `fields`):
\* In Yjs, if the parent Y.Map ("migrated_tbl") does NOT exist in `validationDoc`, the child update stays
\* unintegrated in `validationDoc.store.pendingStructs`! `trackWorkspaceYDocTableChanges` records 0 changed keys,
\* so `assertWorkspaceYDocStructure(validationDoc, changes)` PASSES!
\* Then `readSyncMessage` applies the malformed update to `this.doc` (where "migrated_tbl" DOES exist!),
\* corrupting `this.doc` and bricking future cold-start `assertWorkspaceYDocStructure(doc)`!
WebSocketMalformedChildOnMigratedTable ==
  /\ "migrated_tbl" \in docTables
  /\ IF "migrated_tbl" \in validationDocTables
     THEN \* Caught by assertValidSyncMessage; validationDoc is reset from doc, doc is untouched
          UNCHANGED vars
     ELSE \* Missed by validationDoc because parent table is missing in validationDoc!
          /\ corruptedSubMap' = corruptedSubMap \cup {"migrated_tbl"}
          /\ UNCHANGED <<docTables, validationDocTables, validatedSocket>>

Next ==
  \/ MigrateTable
  \/ WebSocketCreateValidTable
  \/ WebSocketMalformedChildOnMigratedTable

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ docTables \subseteq {"migrated_tbl", "ws_tbl"}
  /\ validationDocTables \subseteq {"migrated_tbl", "ws_tbl"}
  /\ corruptedSubMap \subseteq {"migrated_tbl", "ws_tbl"}

\* Promise 1: validationDoc always mirrors doc at rest.
ValidationDocInSync ==
  validationDocTables = docTables

\* Promise 2: Malformed child updates never corrupt `this.doc` (which bricks DO cold start).
DocAlwaysStructurallyValid ==
  corruptedSubMap = {}
====
