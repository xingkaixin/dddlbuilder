# Worker Concurrency TLA+ Specifications

Checked with [`everystate`](https://github.com/mattzcarey/everystate) (`>= 0.3.1`). Each `.cfg` models the fixed implementation (exit `0`); `*Broken.cfg` models the pre-fix race condition (exit `12` safety or `13` liveness).

## Commands

```bash
for spec in WorkspacePersistQueue WorkspaceValidationDoc WorkspaceSessionRevocation AIConversationDeleteRace AIConversationRetentionAlarm AIUsageSettlementAndRecovery; do
  everystate -config "apps/worker/server-api/__tests__/specs/${spec}.cfg" "apps/worker/server-api/__tests__/specs/${spec}.tla"
done
```

## Specifications

| Spec                               | Configuration                                                                          | Properties                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `WorkspacePersistQueue.tla`        | `ClearInsideDrain`, `MaxUpdates = 3` (fixed), `2` (broken)                             | `AckImpliesPersisted`, `NoOrphanedPendingUpdates`, `AckSurvivesRestart`           |
| `WorkspaceValidationDoc.tla`       | `DistinctIdleSentinel`                                                                 | `ValidationDocInSync`, `DocAlwaysStructurallyValid`                               |
| `WorkspaceSessionRevocation.tla`   | `UseKickEpoch`                                                                         | `NoPostKickAccess`, `NoRevokedSocketOpenAfterKick`                                |
| `AIConversationDeleteRace.tla`     | `GuardConversationDeleted`, with a separate step for resuming after DO access lookup   | `NoUnstoppableRunningOpAfterDelete`, `NoPostDeleteCharge`, `NoWipedStorageCommit` |
| `AIConversationRetentionAlarm.tla` | `RecheckStateAndAbortOnDelete`, with a D1 retention lookup interleaved with submission | `NoActiveOpWipedByRetentionAlarm`                                                 |
| `AIUsageSettlementAndRecovery.tla` | `OrderByRetryTime`, one operation per batch, with expiring backoff                     | `LedgerConservation`, `HealthyOpEventuallySettled`                                |

`../lib/aiConversationRuntime.test.ts` covers reopening the runtime after storage reset and settling a zero-token provider response that fails output validation.
