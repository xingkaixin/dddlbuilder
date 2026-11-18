# Web Concurrency TLA+ Specifications

Checked with [`everystate`](https://github.com/mattzcarey/everystate) (`>= 0.3.1`). Each `.cfg` models the fixed implementation (exit `0`); `*Broken.cfg` models the pre-fix race condition (exit `12` safety or `13` liveness).

## Commands

```bash
everystate -config apps/web/src/__tests__/specs/WebSavedDraftZombie.cfg apps/web/src/__tests__/specs/WebSavedDraftZombie.tla
everystate -config apps/web/src/__tests__/specs/WebWorkspaceCleanup.cfg apps/web/src/__tests__/specs/WebWorkspaceCleanup.tla
```

## Specifications

| Spec                      | Configuration                                                                                | Invariants                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `WebSavedDraftZombie.tla` | `ClearLastLocalSaveAndSyncYDoc`, one active table with interleaved remote sync               | `NoZombieDraftAfterDiscard`, `CacheMatchesYDocWhenIdle`               |
| `WebWorkspaceCleanup.tla` | `FixCacheReactivationAndSyncUnregister`, sign-out cleanup, re-sign-in, and provider disposal | `NoActiveUserOfflineDataWiped`, `NoStaleDisposedOwnerBlockingSignOut` |
