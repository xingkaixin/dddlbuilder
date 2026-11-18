---- MODULE AIUsageSettlementAndRecovery ----
\* Credit ledger conservation and starvation in Cron recovery.
\* Source:
\*   - apps/worker/server-api/lib/credits.ts + packages/db/migrations/0007_atomic_credit_ledger.sql
\*   - apps/worker/server-api/lib/aiUsage.ts:
\*       prepareAIUsageSettlement (lines 211-308)
\*       finalizeAIUsageSettlement (lines 310-427)
\*       reclaimStaleAIUsage (lines 521-647: `AND NOT EXISTS (SELECT 1 FROM ai_call_attempts ...)`)
\*   - apps/worker/server-api/lib/aiConversationRecovery.ts:
\*       recoverAIConversations (a bounded batch ordered by effective retry time)
\*
\* Promises:
\*   1. LedgerConservation (INVARIANT): `credit_accounts.balance` is always >= 0 and equals
\*      initial balance minus reserved/settled ledger deductions (ADR 0001).
\*   2. HealthyOpEventuallySettled (LIVENESS PROPERTY): Under weak fairness of Cron recovery,
\*      a recoverable crashed operation whose user HAS sufficient credits eventually settles (`completed = TRUE`),
\*      even if older operations from other users are stuck in overage debt!

EXTENDS Naturals

CONSTANT OrderByRetryTime  \* FALSE orders by submission time after a retry becomes due.

VARIABLES
  op1Status,      \* Older op1 (submitted_at = 1) from User A who hit overage with 0 remaining balance:
                  \*   "running" -> "settling_debt" | "completed"
  op1Backoff,     \* "none" -> "waiting" -> "due"; Cron can run after the backoff expires.
  op2Status,      \* Newer op2 (submitted_at = 2) from User B whose DO crashed before settle (User B has plenty of balance!):
                  \*   "crashed_unsettled" -> "completed"
  userABalance,   \* CreditAccount balance of User A (starts at 10, reserves 10, actual usage = 15 -> overage 5)
  userALedgerNet, \* Net consumed entries in `credit_ledger` for User A
  userBBalance,   \* CreditAccount balance of User B (starts at 20, reserves 10, actual usage = 6 -> refund 4)
  userBLedgerNet  \* Net consumed entries in `credit_ledger` for User B

vars == <<op1Status, op1Backoff, op2Status, userABalance, userALedgerNet, userBBalance, userBLedgerNet>>

Init ==
  \* Both operations already passed atomic D1 reservation (`admitAICall`):
  \* User A had 10 credits, reserved 10 (balance = 0, ledgerNet = 10), then model used 15 tokens (overage = 5).
  \* User B had 20 credits, reserved 10 (balance = 10, ledgerNet = 10), model used 6 tokens, then DO crashed!
  /\ op1Status = "running"
  /\ op1Backoff = "none"
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
  /\ UNCHANGED <<op1Backoff, op2Status, userABalance, userALedgerNet, userBBalance, userBLedgerNet>>

BackoffExpires ==
  /\ op1Backoff = "waiting"
  /\ op1Backoff' = "due"
  /\ UNCHANGED <<op1Status, op2Status, userABalance, userALedgerNet, userBBalance, userBLedgerNet>>

\* Model one slot per batch. Once op1 has backed off, its effective retry time is later
\* than the submission time of the waiting op2, even when op1 becomes eligible again.
CronStep ==
  IF op1Status # "completed" /\ op1Backoff # "waiting"
     /\ (~OrderByRetryTime \/ op1Backoff = "none" \/ op2Status = "completed")
  THEN
       /\ op1Status' = "settling_debt"
       /\ op1Backoff' = "waiting"
       /\ UNCHANGED <<op2Status, userABalance, userALedgerNet, userBBalance, userBLedgerNet>>
  ELSE IF op2Status = "crashed_unsettled"
       THEN \* Cron picks op2! User B gets 4 credits refunded atomically (`10 - 6 = 4`), op2 completes!
            /\ op2Status' = "completed"
            /\ userBBalance' = userBBalance + 4
            /\ userBLedgerNet' = userBLedgerNet - 4
            /\ UNCHANGED <<op1Status, op1Backoff, userABalance, userALedgerNet>>
       ELSE UNCHANGED vars

Next ==
  \/ Op1HitOverageDebt
  \/ BackoffExpires
  \/ CronStep

Spec == Init /\ [][Next]_vars /\ WF_vars(CronStep) /\ WF_vars(BackoffExpires)

TypeOK ==
  /\ op1Status \in {"running", "settling_debt", "completed"}
  /\ op1Backoff \in {"none", "waiting", "due"}
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
