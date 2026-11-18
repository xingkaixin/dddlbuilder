---- MODULE WebWorkspaceCleanup ----
\* Formal model of Frontend Workspace Cache Cleanup & Owner Disposal Lifecycle
\* Source:
\*   - apps/web/src/services/workspaceCacheRegistry.ts:
\*       rememberWorkspaceCache, markWorkspaceCleanupPending
\*   - apps/web/src/services/workspaceAccountService.ts:
\*       retryPendingWorkspaceCleanup
\*   - apps/web/src/providers/WorkspaceYDocProvider.tsx:
\*       dispose, registerWorkspaceYDocOwner
\*   - apps/web/src/services/workspaceYDocStorage.ts:
\*       prepareWorkspaceSignOut
\*
\* Run:
\*   everystate apps/web/src/__tests__/specs/WebWorkspaceCleanup.tla
\*   everystate -config apps/web/src/__tests__/specs/WebWorkspaceCleanupBroken.cfg apps/web/src/__tests__/specs/WebWorkspaceCleanup.tla

EXTENDS Naturals

CONSTANTS
  FixCacheReactivationAndSyncUnregister \* TRUE = fixed implementation; FALSE = pre-fix mutation

VARIABLES
  authState,         \* "signed_in" | "signed_out"
  cacheStatus,       \* "active" | "pending_cleanup" | "none"
  unsyncedLocalEdit, \* TRUE if signed-in user has offline edits in y-indexeddb
  offlineEditLost,   \* TRUE if bootstrap cleanup wiped y-indexeddb of a signed-in active workspace
  staleDisposedOwner,\* TRUE if a cancelled/timed-out owner remains registered while persistence.destroy hangs
  activeOwnerReady,  \* TRUE if current mounted owner is ready to flush and sign out
  signOutBlockedErr  \* TRUE if prepareWorkspaceSignOut rejected due to a stale disposed owner

vars == <<authState, cacheStatus, unsyncedLocalEdit, offlineEditLost,
          staleDisposedOwner, activeOwnerReady, signOutBlockedErr>>

Init ==
  /\ authState = "signed_in"
  /\ cacheStatus = "active"
  /\ unsyncedLocalEdit = FALSE
  /\ offlineEditLost = FALSE
  /\ staleDisposedOwner = FALSE
  /\ activeOwnerReady = TRUE
  /\ signOutBlockedErr = FALSE

\* workspaceSignOut.ts: markWorkspaceCleanupPending runs, then IDB deleteDatabase is blocked
SignOutCleanupBlocked ==
  /\ authState = "signed_in"
  /\ ~unsyncedLocalEdit
  /\ cacheStatus' = "pending_cleanup"
  /\ authState' = "signed_out"
  /\ activeOwnerReady' = FALSE
  /\ UNCHANGED <<unsyncedLocalEdit, offlineEditLost, staleDisposedOwner, signOutBlockedErr>>

\* User signs back into the same account in the same SPA session -> rememberWorkspaceCache(scope)
ReLoginSameSpaSession ==
  /\ authState = "signed_out"
  /\ authState' = "signed_in"
  /\ activeOwnerReady' = TRUE
  /\ cacheStatus' = (IF FixCacheReactivationAndSyncUnregister THEN "active" ELSE cacheStatus)
  /\ UNCHANGED <<unsyncedLocalEdit, offlineEditLost, staleDisposedOwner, signOutBlockedErr>>

\* Signed-in user edits workspace locally before cloud sync
MakeUnsyncedEdit ==
  /\ authState = "signed_in"
  /\ activeOwnerReady
  /\ unsyncedLocalEdit' = TRUE
  /\ UNCHANGED <<authState, cacheStatus, offlineEditLost, staleDisposedOwner, activeOwnerReady, signOutBlockedErr>>

\* Page reload runs retryPendingWorkspaceCleanup()
PageReloadBootstrapCleanup ==
  /\ IF cacheStatus = "pending_cleanup"
     THEN /\ offlineEditLost' = (offlineEditLost \/ unsyncedLocalEdit)
          /\ unsyncedLocalEdit' = FALSE
          /\ cacheStatus' = "none"
          /\ UNCHANGED <<authState, staleDisposedOwner, activeOwnerReady, signOutBlockedErr>>
     ELSE UNCHANGED vars

\* Bootstrap retry or provider remount disposes previous owner while persistence.destroy() is still pending
RemountWithPendingDestroy ==
  /\ authState = "signed_in"
  /\ activeOwnerReady' = TRUE
  /\ staleDisposedOwner' = (IF FixCacheReactivationAndSyncUnregister THEN FALSE ELSE TRUE)
  /\ UNCHANGED <<authState, cacheStatus, unsyncedLocalEdit, offlineEditLost, signOutBlockedErr>>

\* User clicks Sign Out while current owner is ready
AttemptSignOut ==
  /\ authState = "signed_in"
  /\ activeOwnerReady
  /\ IF staleDisposedOwner
     THEN /\ signOutBlockedErr' = TRUE
          /\ UNCHANGED <<authState, cacheStatus, unsyncedLocalEdit, offlineEditLost, staleDisposedOwner, activeOwnerReady>>
     ELSE /\ unsyncedLocalEdit' = FALSE
          /\ authState' = "signed_out"
          /\ cacheStatus' = "none"
          /\ activeOwnerReady' = FALSE
          /\ UNCHANGED <<offlineEditLost, staleDisposedOwner, signOutBlockedErr>>

Next ==
  \/ SignOutCleanupBlocked
  \/ ReLoginSameSpaSession
  \/ MakeUnsyncedEdit
  \/ PageReloadBootstrapCleanup
  \/ RemountWithPendingDestroy
  \/ AttemptSignOut

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ authState \in {"signed_in", "signed_out"}
  /\ cacheStatus \in {"active", "pending_cleanup", "none"}
  /\ unsyncedLocalEdit \in BOOLEAN
  /\ offlineEditLost \in BOOLEAN
  /\ staleDisposedOwner \in BOOLEAN
  /\ activeOwnerReady \in BOOLEAN
  /\ signOutBlockedErr \in BOOLEAN

NoActiveUserOfflineDataWiped ==
  ~offlineEditLost

NoStaleDisposedOwnerBlockingSignOut ==
  ~signOutBlockedErr
====
