---- MODULE AIConversationDeleteRace ----
\* Formal model of AI Conversation deletion vs concurrent operation submission
\* Source:
\*   - apps/worker/server-api/routes/aiConversations.ts:
\*       ownedOperation (lines 54-67)
\*       POST /ai/operations/:id (lines 171-230)
\*       POST /ai/operations/:id/stop (lines 233-248)
\*       DELETE /ai/conversations/:id (lines 254-291)
\*   - apps/worker/server-api/lib/aiConversationDurableObject.ts:
\*       fetch /delete, /submit, /stop (lines 637-779)
\*       alarm (lines 851-911)
\*   - apps/worker/server-api/lib/aiConversationUsage.ts:
\*       readAIOperationAccess (lines 76-88)
\*       admitAICall (lines 197-267)
\*
\* Promise (docs/modules/account-and-ai.md):
\*   "删除会话先停止并完成结算，再清理 DO。"
\*   1. Once DELETE /ai/conversations/:id succeeds, no unstopped operation may admit
\*      a model call and charge credits on that deleted conversation.
\*   2. Any running/admitted operation must remain stoppable by the user or already be stopped.
\*   3. DO storage must not be wiped (`deleteAll`) while `/submit` is mid-flight creating/committing state.

EXTENDS Naturals

CONSTANTS
  GuardConversationDeleted \* FALSE = current SQL/DO checks; TRUE = atomic conversation.deleted_at guard

VARIABLES
  convDeleted,       \* D1 ai_conversations.deleted_at != NULL
  opSubmitted,       \* D1 ai_operations.submitted_at != NULL
  opStopped,         \* D1 ai_operations.stopped_at != NULL
  opCompleted,       \* D1 ai_operations.completed_at != NULL
  chargedAfterDelete,\* TRUE if admitAICall reserved/charged credits AFTER DELETE completed (`deletePhase = "done"`)
  submitPhase,       \* HTTP POST /ai/operations/:id phase:
                     \*   "init" -> "authorized" -> "marked_submitted" -> "do_creating" -> "do_running" -> "done"
  deletePhase,       \* HTTP DELETE /ai/conversations/:id phase:
                     \*   "idle" -> "scanned_ops" -> "stopped_ops" -> "marked_deleted" -> "done"
  scannedSubmitted,  \* whether DELETE's SELECT saw opSubmitted = TRUE
  doHasState,        \* whether DO State.operation is populated
  doAlarmArmed,      \* whether /delete armed the +1ms alarm
  doStorageWiped,    \* whether alarm() ran ctx.storage.deleteAll() while submit was mid-flight
  corruptedCommit    \* TRUE if /submit committed to a wiped/closed Harness

vars == <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
          submitPhase, deletePhase, scannedSubmitted, doHasState,
          doAlarmArmed, doStorageWiped, corruptedCommit>>

Init ==
  \* Operation row was just created via POST /ai/operations (submitted_at = NULL, stopped_at = NULL)
  /\ convDeleted = FALSE
  /\ opSubmitted = FALSE
  /\ opStopped = FALSE
  /\ opCompleted = FALSE
  /\ chargedAfterDelete = FALSE
  /\ submitPhase = "init"
  /\ deletePhase = "idle"
  /\ scannedSubmitted = FALSE
  /\ doHasState = FALSE
  /\ doAlarmArmed = FALSE
  /\ doStorageWiped = FALSE
  /\ corruptedCommit = FALSE

\* --- Submit HTTP Route & DO Actions ---

\* routes/aiConversations.ts:173 `const operation = await ownedOperation(...)` (checks c.deleted_at IS NULL)
SubmitAuthorize ==
  /\ submitPhase = "init"
  /\ ~convDeleted
  /\ submitPhase' = "authorized"
  /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                 deletePhase, scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>

\* routes/aiConversations.ts:194-210 `UPDATE ai_operations SET input_hash = ?, submitted_at = ... WHERE id = ? AND stopped_at IS NULL`
\* Current code does NOT check `ai_conversations.deleted_at IS NULL` here!
SubmitMarkD1 ==
  /\ submitPhase = "authorized"
  /\ IF opStopped \/ (GuardConversationDeleted /\ convDeleted)
     THEN /\ submitPhase' = "done"
          /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                         deletePhase, scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>
     ELSE /\ opSubmitted' = TRUE
          /\ submitPhase' = "marked_submitted"
          /\ UNCHANGED <<convDeleted, opStopped, opCompleted, chargedAfterDelete,
                         deletePhase, scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>

\* aiConversationDurableObject.ts:697-715 `/submit` checks assertAIOperationAccess (which ignores convDeleted!)
\* and awaits loadAIConversationConfig / createConversation before committing State.operation
SubmitDOBegin ==
  /\ submitPhase = "marked_submitted"
  /\ IF opStopped \/ opCompleted \/ (GuardConversationDeleted /\ convDeleted)
     THEN /\ submitPhase' = "done"
          /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                         deletePhase, scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>
     ELSE /\ submitPhase' = "do_creating"
          /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                         deletePhase, scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>

\* aiConversationDurableObject.ts:720-756 `/submit` commits State.operation and calls this.start()
SubmitDOCommit ==
  /\ submitPhase = "do_creating"
  /\ IF doStorageWiped
     THEN /\ corruptedCommit' = TRUE
          /\ submitPhase' = "done"
          /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                         deletePhase, scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped>>
     ELSE /\ doHasState' = TRUE
          /\ doStorageWiped' = FALSE
          /\ submitPhase' = "do_running"
          /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                         deletePhase, scannedSubmitted, doAlarmArmed, corruptedCommit>>

\* aiConversationUsage.ts:197-267 `admitAICall` checks readAIOperationAccess (ignores convDeleted!) and charges credits
ExecuteAdmitAndCharge ==
  /\ submitPhase = "do_running"
  /\ IF opStopped \/ opCompleted \/ (GuardConversationDeleted /\ convDeleted)
     THEN /\ opCompleted' = TRUE
          /\ submitPhase' = "done"
          /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, chargedAfterDelete,
                         deletePhase, scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>
     ELSE /\ chargedAfterDelete' = (deletePhase = "done")
          /\ opCompleted' = TRUE
          /\ submitPhase' = "done"
          /\ UNCHANGED <<convDeleted, opSubmitted, opStopped,
                         deletePhase, scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>

\* --- Delete Conversation HTTP Route & DO Alarm Actions ---

\* routes/aiConversations.ts:258-262
\* Current code: `SELECT id FROM ai_operations WHERE conversation_id = ? AND completed_at IS NULL AND submitted_at IS NOT NULL`
\* Fixed design: atomically marks all uncompleted operations (even submitted_at IS NULL) stopped_at, and sets convDeleted!
DeleteScanOperations ==
  /\ deletePhase = "idle"
  /\ ~convDeleted
  /\ IF GuardConversationDeleted
     THEN /\ convDeleted' = TRUE
          /\ opStopped' = IF ~opCompleted THEN TRUE ELSE opStopped
          /\ scannedSubmitted' = (opSubmitted /\ ~opCompleted)
          /\ deletePhase' = "marked_deleted"
          /\ UNCHANGED <<opSubmitted, opCompleted, chargedAfterDelete, submitPhase,
                         doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>
     ELSE /\ scannedSubmitted' = (opSubmitted /\ ~opCompleted)
          /\ deletePhase' = "scanned_ops"
          /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                         submitPhase, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>

\* routes/aiConversations.ts:264-271 loop over scanned operations -> UPDATE stopped_at & forward /stop
DeleteStopScanned ==
  /\ deletePhase = "scanned_ops"
  /\ opStopped' = (IF scannedSubmitted THEN TRUE ELSE opStopped)
  /\ deletePhase' = "stopped_ops"
  /\ UNCHANGED <<convDeleted, opSubmitted, opCompleted, chargedAfterDelete, submitPhase,
                 scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>

\* routes/aiConversations.ts:273-277 `UPDATE ai_conversations SET deleted_at = COALESCE(deleted_at, ?) WHERE id = ?`
DeleteMarkConversation ==
  /\ deletePhase = "stopped_ops"
  /\ convDeleted' = TRUE
  /\ deletePhase' = "marked_deleted"
  /\ UNCHANGED <<opSubmitted, opStopped, opCompleted, chargedAfterDelete, submitPhase,
                 scannedSubmitted, doHasState, doAlarmArmed, doStorageWiped, corruptedCommit>>

\* routes/aiConversations.ts:285-288 `forward(..., '/delete')` -> sets DO alarm(Date.now() + 1) and returns 200 { deleted: true }
DeleteScheduleDOAlarm ==
  /\ deletePhase = "marked_deleted"
  /\ doAlarmArmed' = TRUE
  /\ deletePhase' = "done"
  /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                 submitPhase, scannedSubmitted, doHasState, doStorageWiped, corruptedCommit>>

\* aiConversationDurableObject.ts:851-859 `alarm()`: if (!operation) await ctx.storage.deleteAll()
DOAlarmFire ==
  /\ doAlarmArmed
  /\ doAlarmArmed' = FALSE
  /\ IF ~doHasState /\ ~(GuardConversationDeleted /\ submitPhase = "do_creating")
     THEN /\ doStorageWiped' = TRUE
          /\ UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                         submitPhase, deletePhase, scannedSubmitted, doHasState, corruptedCommit>>
     ELSE UNCHANGED <<convDeleted, opSubmitted, opStopped, opCompleted, chargedAfterDelete,
                      submitPhase, deletePhase, scannedSubmitted, doHasState, doStorageWiped, corruptedCommit>>

Next ==
  \/ SubmitAuthorize
  \/ SubmitMarkD1
  \/ SubmitDOBegin
  \/ SubmitDOCommit
  \/ ExecuteAdmitAndCharge
  \/ DeleteScanOperations
  \/ DeleteStopScanned
  \/ DeleteMarkConversation
  \/ DeleteScheduleDOAlarm
  \/ DOAlarmFire

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ convDeleted \in BOOLEAN
  /\ opSubmitted \in BOOLEAN
  /\ opStopped \in BOOLEAN
  /\ opCompleted \in BOOLEAN
  /\ chargedAfterDelete \in BOOLEAN
  /\ submitPhase \in {"init", "authorized", "marked_submitted", "do_creating", "do_running", "done"}
  /\ deletePhase \in {"idle", "scanned_ops", "stopped_ops", "marked_deleted", "done"}
  /\ scannedSubmitted \in BOOLEAN
  /\ doHasState \in BOOLEAN
  /\ doAlarmArmed \in BOOLEAN
  /\ doStorageWiped \in BOOLEAN
  /\ corruptedCommit \in BOOLEAN

\* Promise 1: If DELETE /ai/conversations/:id completed, no unstopped operation is running on that conversation
\* (where `POST /ai/operations/:id/stop` would reject with 404).
NoUnstoppableRunningOpAfterDelete ==
  ~(deletePhase = "done" /\ submitPhase = "do_running" /\ ~opStopped)

\* Promise 2: Once DELETE /ai/conversations/:id has returned `{ deleted: true }`, `admitAICall` never charges credits.
NoPostDeleteCharge ==
  ~chargedAfterDelete

\* Promise 2: `/submit` never commits to a DO whose SQLite storage was wiped mid-flight by `/delete`'s +1ms alarm.
NoWipedStorageCommit ==
  ~corruptedCommit
====
