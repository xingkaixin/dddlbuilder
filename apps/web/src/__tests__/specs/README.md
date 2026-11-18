# Web Concurrency TLA+ Specifications

Checked with [`everystate`](https://github.com/mattzcarey/everystate) (`>= 0.3.1`). Each `.cfg` models the fixed implementation (exit `0`); `*Broken.cfg` models the pre-fix race condition (exit `12` safety or `13` liveness).

## Commands

```bash
everystate -config apps/web/src/__tests__/specs/WebSavedDraftZombie.cfg apps/web/src/__tests__/specs/WebSavedDraftZombie.tla
everystate -config apps/web/src/__tests__/specs/WebWorkspaceCleanup.cfg apps/web/src/__tests__/specs/WebWorkspaceCleanup.tla
```

## Specifications

| Spec                      | Code Mapped                                                                                                                                                       | Bounds / Constants                                                                                      | Invariants                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `WebSavedDraftZombie.tla` | `src/hooks/usePersistedState.ts`, `src/hooks/workspacePersistence/useSavedTableDraftRecords.ts`, `src/hooks/workspacePersistence/useWorkspaceYDocSubscription.ts` | `FixApplied = TRUE` (`.cfg`) / `FALSE` (`Broken.cfg`), single active table + remote sync interleaving   | `NoZombieSavedDraft` (discarded saved-table draft is not resurrected by unrelated remote updates) |
| `WebWorkspaceCleanup.tla` | `src/services/workspaceCacheRegistry.ts`, `src/services/workspaceAccountService.ts`, `src/providers/WorkspaceYDocProvider.tsx`                                    | `FixApplied = TRUE` (`.cfg`) / `FALSE` (`Broken.cfg`), sign-out cleanup + re-sign-in + provider dispose | `ActiveSessionNeverMarkedPendingCleanup`, `DisposedProviderReleasesOwner`                         |
