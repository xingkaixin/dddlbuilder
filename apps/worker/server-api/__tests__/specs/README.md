# Worker Concurrency TLA+ Specifications

Checked with [`everystate`](https://github.com/mattzcarey/everystate) (`>= 0.3.1`). Each `.cfg` models the fixed implementation (exit `0`); `*Broken.cfg` models the pre-fix race condition (exit `12` safety or `13` liveness).

## Commands

```bash
for spec in WorkspacePersistQueue WorkspaceValidationDoc WorkspaceSessionRevocation AIConversationDeleteRace AIConversationRetentionAlarm AIUsageSettlementAndRecovery; do
  everystate -config "apps/worker/server-api/__tests__/specs/${spec}.cfg" "apps/worker/server-api/__tests__/specs/${spec}.tla"
done
```

## Specifications

| Spec                               | Code Mapped                                                                                                                      | Bounds / Constants                                                                    | Properties                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkspacePersistQueue.tla`        | `server-api/lib/workspaceYDocDurableObject.ts` (`persistUpdate`, `drainPendingUpdates`, `awaitPersisted`, `alarm`)               | `MaxUpdates = 2`, `FixApplied = TRUE` / `FALSE`                                       | `AckImpliesDurable` (never emit `persisted` ACK before DO storage commit)                                                                      |
| `WorkspaceValidationDoc.tla`       | `server-api/lib/workspaceYDocDurableObject.ts` (`handleMigrate`, `validationDoc` sync, `webSocketMessage`)                       | `FixApplied = TRUE` / `FALSE`                                                         | `MalformedUpdateRejected` (`validationDoc` tracks HTTP `/migrate` transactions so child updates cannot bypass validation via `pendingStructs`) |
| `WorkspaceSessionRevocation.tla`   | `server-api/lib/workspaceYDocDurableObject.ts` (`handleKick`, `authorizedSessionIds`, `authEpoch`)                               | `FixApplied = TRUE` / `FALSE`                                                         | `RevokedSessionNeverAuthorizedAfterKick` (in-flight D1 session reads before `/kick` cannot repopulate `authCache`)                             |
| `AIConversationDeleteRace.tla`     | `server-api/routes/aiConversations.ts`, `server-api/lib/aiConversationUsage.ts`, `server-api/lib/aiConversationDurableObject.ts` | `FixApplied = TRUE` / `FALSE`, concurrent prepare / submit / delete / DO alarm        | `NoPostDeleteCharge`, `NoUnsettledStorageWipe`                                                                                                 |
| `AIConversationRetentionAlarm.tla` | `server-api/lib/aiConversationDurableObject.ts` (`alarm`, `resetStorage`, `ensureReady`)                                         | `FixApplied = TRUE` / `FALSE`, retention `alarm()` D1 read interleaved with `/submit` | `ActiveOperationNeverWiped`, `WarmObjectUsableAfterReset`                                                                                      |
| `AIUsageSettlementAndRecovery.tla` | `server-api/lib/aiUsage.ts` (`prepareAIUsageSettlement`), `server-api/lib/aiConversationRecovery.ts` (`recoverAIConversations`)  | `FixApplied = TRUE` / `FALSE`, 0-token completed provider call + overage Cron queue   | `ZeroTokenFailedValidationSettles`, `HealthyOperationEventuallyRecovers`                                                                       |
