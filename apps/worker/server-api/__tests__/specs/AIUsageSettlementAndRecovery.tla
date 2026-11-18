---- MODULE AIUsageSettlementAndRecovery ----
\* Formal model of Credit Ledger Conservation, Settlement SQL Guard, and Cron Recovery Starvation
\* Source:
\*   - apps/worker/server-api/lib/credits.ts + packages/db/migrations/0007_atomic_credit_ledger.sql
\*   - apps/worker/server-api/lib/aiUsage.ts:
\*       prepareAIUsageSettlement (lines 211-308)
\*       finalizeAIUsageSettlement (lines 310-427)
\*       reclaimStaleAIUsage (lines 521-647: `AND NOT EXISTS (SELECT 1 FROM ai_call_attempts ...)`)
\*   - apps/worker/server-api/lib/aiConversationRecovery.ts:
\*       recoverAIConversations (lines 49-83: `ORDER BY o.submitted_at LIMIT 100` with NO `recovery_after` backoff!)
\*
\* Promises:
\*   1. LedgerConservation (INVARIANT): `credit_accounts.balance` is always >= 0 and equals
\*      initial balance minus reserved/settled ledger deductions (ADR 0001).
\*   2. AllRecoverableOpsEventuallySettle (LIVENESS PROPERTY): Under weak fairness of Cron recovery,
\*      a recoverable crashed operation whose user HAS sufficient credits eventually settles (`completed = TRUE`),
\*      even if older operations from other users are stuck in overage debt!

EXTENDS Naturals

CONSTANTS
  CronLimit,          \* Cron batch size (models `LIMIT 100` at small scale: CronLimit = 1)
  UseRecoveryBackoff  \* FALSE = current code (`ORDER BY o.submitted_at LIMIT K` without `recovery_after`);
                      \* TRUE  = fixed design (defers stuck debt ops via `recovery_after` so healthy ops make progress)

VARIABLES
  op1Status,      \* Older op1 (submitted_at = 1) from User A who hit overage with 0 remaining balance:
                  \*   "running" -> "settling_debt" | "completed"
  op1Deferred,    \* Whether op1 has been deferred by `recovery_after`
  op2Status,      \* Newer op2 (submitted_at = 2) from User B whose DO crashed before settle (User B has plenty of balance!):
                  \*   "crashed_unsettled" -> "completed"
  userABalance,   \* CreditAccount balance of User A (starts at 10, reserves 10, actual usage = 15 -> overage 5)
  userALedgerNet, \* Net consumed entries in `credit_ledger` for User A
  userBBalance,   \* CreditAccount balance of User B (starts at 20, reserves 10, actual usage = 6 -> refund 4)
  userBLedgerNet  \* Net consumed entries in `credit_ledger` for User B

vars == <<op1Status, op1Deferred, op2Status, userABalance, userALedgerNet, userBBalance, userBLedgerNet>>

Init ==
  \* Both operations already passed atomic D1 reservation (`admitAICall`):
  \* User A had 10 credits, reserved 10 (balance = 0, ledgerNet = 10), then model used 15 tokens (overage = 5).
  \* User B had 20 credits, reserved 10 (balance = 10, ledgerNet = 10), model used 6 tokens, then DO crashed!
  /\ op1Status = "running"
  /\ op1Deferred = FALSE
  /\ op2Status = "crashed_unsettled"
  /\ userABalance = 0
  /\ userALedgerNet = 10
  /\ userBBalance = 10
  /\ userBLedgerNet = 10

\* User A's op1 attempts settlement: `prepareAIUsageSettlement` sets `settling_succeeded` (charged = 15),
\* then `finalizeAIUsageSettlement` tries to consume 5 extra credits, which ABORTs with CREDIT_EXHAUSTED!
Op1HitOverageDebt ==
  /\ op1Status = "running"
  /\ userABalance < 5
  /\ op1Status' = "settling_debt"
  /\ UNCHANGED <<op1Deferred, op2Status, userABalance, userALedgerNet, userBBalance, userBLedgerNet>>

\* Cron `recoverAIConversations` runs (`ORDER BY submitted_at LIMIT CronLimit`):
\* Note: `reclaimStaleAIUsage` skips BOTH op1 and op2 because `EXISTS (SELECT 1 FROM ai_call_attempts ...)`!
\* With CronLimit = 1:
\*   - Current code (`UseRecoveryBackoff = FALSE`) ALWAYS picks op1 (`submitted_at = 1`) first!
\*     op1 fails `CREDIT_EXHAUSTED` again, op1.completed_at stays NULL, and op2 (`submitted_at = 2`) is NEVER reached!
\*   - Fixed design (`UseRecoveryBackoff = TRUE`) sets `recovery_after` on op1 after failure, allowing Cron to pick op2!
CronStep ==
  IF op1Status # "completed" /\ (~UseRecoveryBackoff \/ ~op1Deferred)
  THEN \* Cron picks oldest uncompleted non-deferred op: op1!
       /\ op1Status' = "settling_debt"
       /\ op1Deferred' = (IF UseRecoveryBackoff THEN TRUE ELSE FALSE)
       /\ UNCHANGED <<op2Status, userABalance, userALedgerNet, userBBalance, userBLedgerNet>>
  ELSE IF op2Status = "crashed_unsettled"
       THEN \* Cron picks op2! User B gets 4 credits refunded atomically (`10 - 6 = 4`), op2 completes!
            /\ op2Status' = "completed"
            /\ userBBalance' = userBBalance + 4
            /\ userBLedgerNet' = userBLedgerNet - 4
            /\ UNCHANGED <<op1Status, op1Deferred, userABalance, userALedgerNet>>
       ELSE UNCHANGED vars

Next ==
  \/ Op1HitOverageDebt
  \/ CronStep

Spec == Init /\ [][Next]_vars /\ WF_vars(CronStep)

TypeOK ==
  /\ op1Status \in {"running", "settling_debt", "completed"}
  /\ op1Deferred \in BOOLEAN
  /\ op2Status \in {"crashed_unsettled", "completed"}
  /\ userABalance \in 0..20
  /\ userALedgerNet \in 0..20
  /\ userBBalance \in 0..20
  /\ userBLedgerNet \in 0..20

\* ADR 0001 Safety Promise: Credit account balance + net ledger consumption is strictly conserved and non-negative!
LedgerConservation ==
  /\ userABalance >= 0 /\ userBBalance >= 0
  /\ userABalance + userALedgerNet = 10
  /\ userBBalance + userBLedgerNet = 20

\* Liveness Promise: Healthy User B's crashed operation eventually settles via Cron recovery (no head-of-line starvation).
HealthyOpEventuallySettled ==
  <>(op2Status = "completed")
====
