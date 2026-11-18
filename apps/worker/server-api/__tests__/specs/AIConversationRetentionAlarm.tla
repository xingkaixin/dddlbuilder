---- MODULE AIConversationRetentionAlarm ----
\* Formal model of AIConversationDurableObject retention alarm vs concurrent /submit
\* Source:
\*   - apps/worker/server-api/routes/aiConversations.ts:
\*       POST /ai/operations/:id (lines 171-220): extends `expires_at` in D1 and forwards `/submit`
\*   - apps/worker/server-api/lib/aiConversationDurableObject.ts:
\*       fetch POST /submit (lines 669-759)
\*       alarm (lines 851-883):
\*         1) reads `const { operation } = await this.state()` (op1 settled)
\*         2) awaits external D1 `SELECT expires_at, deleted_at FROM ai_conversations` (Input Gate OPEN!)
\*         3) WITHOUT re-checking `this.state()`, calls `harness.close()`, `ctx.storage.deleteAll()`,
\*            and `UPDATE ai_conversations SET deleted_at = ...`, WITHOUT `this.ctx.abort()`!
\*
\* Promise: An active running operation (op2) that extended `expires_at` and was accepted by `/submit`
\* never has its underlying DO SQLite storage (`State` / `Receipts`) wiped or its conversation marked
\* `deleted_at` by a stale retention alarm from `op1`.

EXTENDS Naturals

CONSTANTS
  RecheckStateAndAbortOnDelete \* FALSE = current code; TRUE = re-check State.operation & D1 expires_at + abort warm isolate

VARIABLES
  d1Expired,          \* TRUE when D1 `ai_conversations.expires_at <= now`
  d1Deleted,          \* TRUE when D1 `ai_conversations.deleted_at != NULL`
  doOp,               \* current `State.operation` in DO: "op1_settled" | "op2_running"
  doReceiptsPresent,  \* TRUE when op2 has active state/receipts in DO SQLite
  harnessClosedInMem, \* TRUE when `this.harness.close()` ran without `this.ctx.abort()`
  alarmPhase,         \* "idle" -> "queried_d1" -> "done"
  alarmSawExpired,    \* result of D1 query in alarm()
  submit2Phase,       \* "idle" -> "extended_d1" -> "accepted_in_do"
  activeOpWiped       \* TRUE if `deleteAll()` wiped DO storage while `op2_running`!

vars == <<d1Expired, d1Deleted, doOp, doReceiptsPresent, harnessClosedInMem,
          alarmPhase, alarmSawExpired, submit2Phase, activeOpWiped>>

Init ==
  /\ d1Expired = TRUE           \* right at retention boundary after op1 settled
  /\ d1Deleted = FALSE
  /\ doOp = "op1_settled"
  /\ doReceiptsPresent = FALSE
  /\ harnessClosedInMem = FALSE
  /\ alarmPhase = "idle"
  /\ alarmSawExpired = FALSE
  /\ submit2Phase = "idle"
  /\ activeOpWiped = FALSE

\* alarm() lines 853-866: sees op1_settled (`!running && !accountingPending`), starts D1 SELECT
AlarmStartD1Read ==
  /\ alarmPhase = "idle"
  /\ doOp = "op1_settled"
  /\ alarmSawExpired' = (d1Expired \/ d1Deleted)
  /\ alarmPhase' = "queried_d1"
  /\ UNCHANGED <<d1Expired, d1Deleted, doOp, doReceiptsPresent, harnessClosedInMem,
                 submit2Phase, activeOpWiped>>

\* routes/aiConversations.ts:194-207: Round 2 (authorized ms before expiry) extends `expires_at` in D1!
Submit2ExtendExpiryInD1 ==
  /\ submit2Phase = "idle"
  /\ ~d1Deleted
  /\ d1Expired' = FALSE
  /\ submit2Phase' = "extended_d1"
  /\ UNCHANGED <<d1Deleted, doOp, doReceiptsPresent, harnessClosedInMem,
                 alarmPhase, alarmSawExpired, activeOpWiped>>

\* aiConversationDurableObject.ts:720-756: while alarm() awaits D1 (Input Gate open!),
\* `/submit` commits `State.operation = op2` (`status: 'running', accountingPending: true`)
Submit2AcceptInDO ==
  /\ submit2Phase = "extended_d1"
  /\ ~harnessClosedInMem
  /\ doOp' = "op2_running"
  /\ doReceiptsPresent' = TRUE
  /\ submit2Phase' = "accepted_in_do"
  /\ UNCHANGED <<d1Expired, d1Deleted, harnessClosedInMem, alarmPhase, alarmSawExpired, activeOpWiped>>

\* aiConversationDurableObject.ts:868-882: alarm() resumes from D1 SELECT
AlarmFinish ==
  /\ alarmPhase = "queried_d1"
  /\ IF ~alarmSawExpired
     THEN /\ alarmPhase' = "done"
          /\ UNCHANGED <<d1Expired, d1Deleted, doOp, doReceiptsPresent, harnessClosedInMem,
                         alarmSawExpired, submit2Phase, activeOpWiped>>
     ELSE IF RecheckStateAndAbortOnDelete /\ (doOp = "op2_running" \/ ~d1Expired)
          THEN /\ alarmPhase' = "done"
               /\ UNCHANGED <<d1Expired, d1Deleted, doOp, doReceiptsPresent, harnessClosedInMem,
                              alarmSawExpired, submit2Phase, activeOpWiped>>
          ELSE \* Current code: blindly closes harness, wipes storage, marks D1 deleted_at!
               /\ activeOpWiped' = (doOp = "op2_running")
               /\ doReceiptsPresent' = FALSE
               /\ harnessClosedInMem' = ~RecheckStateAndAbortOnDelete
               /\ d1Deleted' = TRUE
               /\ alarmPhase' = "done"
               /\ UNCHANGED <<d1Expired, doOp, alarmSawExpired, submit2Phase>>

Next ==
  \/ AlarmStartD1Read
  \/ Submit2ExtendExpiryInD1
  \/ Submit2AcceptInDO
  \/ AlarmFinish

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ d1Expired \in BOOLEAN
  /\ d1Deleted \in BOOLEAN
  /\ doOp \in {"op1_settled", "op2_running"}
  /\ doReceiptsPresent \in BOOLEAN
  /\ harnessClosedInMem \in BOOLEAN
  /\ alarmPhase \in {"idle", "queried_d1", "done"}
  /\ alarmSawExpired \in BOOLEAN
  /\ submit2Phase \in {"idle", "extended_d1", "accepted_in_do"}
  /\ activeOpWiped \in BOOLEAN

\* Safety Promise 1: An accepted running operation never has its DO storage wiped or D1 conversation deleted.
NoActiveOpWipedByRetentionAlarm ==
  ~activeOpWiped /\ ~(doOp = "op2_running" /\ d1Deleted)
====
