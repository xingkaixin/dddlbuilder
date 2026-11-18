---- MODULE WorkspaceSessionRevocation ----
\* Formal model of WorkspaceYDocDurableObject session authorization cache & kick protocol
\* Source:
\*   - apps/worker/server-api/lib/workspaceYDocDurableObject.ts:
\*       fetch WebSocket upgrade (lines 115-152)
\*       handleKick (lines 504-521)
\*       authorizedSessionIds (lines 523-539)
\*       authorizeSockets (lines 541-560)
\*   - apps/worker/server-api/lib/sessionRevocation.ts:
\*       kickWorkspaceSockets (lines 50-87)
\*   - apps/worker/server-api/routes/admin.ts:
\*       POST /admin/users/:userId/disable (lines 178-181)
\*
\* Promise (docs/architecture.md & docs/modules/workspace-sync.md):
\*   "HTTP 路由和 Durable Object 都以 D1 中的会话和归属为准；会话被撤销时主动断开同步连接。"
\*   Once a session revocation (sign-out or admin disable) has deleted/disabled the session in D1
\*   AND `POST /kick` on the DO has returned `{ ok: true }`, the revoked session cannot complete
\*   a WebSocket handshake or execute authorized workspace mutations via a poisoned authCache.

EXTENDS Naturals

CONSTANTS
  UseKickEpoch \* FALSE = current code (no epoch guard on authCache or handshake);
               \* TRUE  = fixed design (increments kickEpoch in handleKick, rejects stale D1 read & handshake)

VARIABLES
  d1SessionActive,    \* TRUE while session 's1' is active in D1
  revokePhase,        \* "idle" -> "d1_revoked" -> "kicked"
  authCacheValid,     \* whether DO `this.authCache` currently contains 's1'
  kickEpoch,          \* monotonic counter incremented on each handleKick
  wsAccepted,         \* whether socket for 's1' is currently accepted/open in DO
  handshakePhase,     \* "idle" -> "reading_d1" -> "done"
  handshakeReadValid, \* result read from D1 during `readSessionAccess`
  handshakeEpoch,     \* kickEpoch observed before `await readSessionAccess`
  postKickWriteAllowed \* TRUE if 's1' successfully performed a write AFTER revokePhase = "kicked"

vars == <<d1SessionActive, revokePhase, authCacheValid, kickEpoch, wsAccepted,
          handshakePhase, handshakeReadValid, handshakeEpoch, postKickWriteAllowed>>

Init ==
  /\ d1SessionActive = TRUE
  /\ revokePhase = "idle"
  /\ authCacheValid = FALSE
  /\ kickEpoch = 0
  /\ wsAccepted = FALSE
  /\ handshakePhase = "idle"
  /\ handshakeReadValid = FALSE
  /\ handshakeEpoch = 0
  /\ postKickWriteAllowed = FALSE

\* --- Handshake / Auth Lookup in WorkspaceYDocDurableObject ---

\* workspaceYDocDurableObject.ts:121 -> authorizedSessionIds() (lines 523-535)
\* Cache miss initiates external D1 query `readSessionAccess` (DO input gate is OPEN during D1 I/O!)
HandshakeStartAuthLookup ==
  /\ handshakePhase = "idle"
  /\ ~authCacheValid
  /\ handshakeEpoch' = kickEpoch
  /\ handshakeReadValid' = d1SessionActive
  /\ handshakePhase' = "reading_d1"
  /\ UNCHANGED <<d1SessionActive, revokePhase, authCacheValid, kickEpoch, wsAccepted, postKickWriteAllowed>>

\* workspaceYDocDurableObject.ts:536 & 134:
\* `this.authCache = { key, sessionIds, expiresAt: now + 30_000 }` then `this.state.acceptWebSocket(server)`
HandshakeFinishAuthLookup ==
  /\ handshakePhase = "reading_d1"
  /\ IF UseKickEpoch /\ handshakeEpoch # kickEpoch
     THEN \* Fixed: epoch changed while D1 read was in flight -> do not poison cache or accept socket
          /\ handshakePhase' = "done"
          /\ UNCHANGED <<d1SessionActive, revokePhase, authCacheValid, kickEpoch, wsAccepted,
                         handshakeReadValid, handshakeEpoch, postKickWriteAllowed>>
     ELSE /\ authCacheValid' = handshakeReadValid
          /\ wsAccepted' = (IF handshakeReadValid THEN TRUE ELSE wsAccepted)
          /\ handshakePhase' = "done"
          /\ UNCHANGED <<d1SessionActive, revokePhase, kickEpoch, handshakeReadValid,
                         handshakeEpoch, postKickWriteAllowed>>

\* workspaceYDocDurableObject.ts:219 `webSocketMessage` -> `authorizeSockets([ws])` hitting `this.authCache`
RevokedSocketMutatesDoc ==
  /\ revokePhase = "kicked"
  /\ wsAccepted
  /\ authCacheValid
  /\ postKickWriteAllowed' = TRUE
  /\ UNCHANGED <<d1SessionActive, revokePhase, authCacheValid, kickEpoch, wsAccepted,
                 handshakePhase, handshakeReadValid, handshakeEpoch>>

\* --- Session Revocation (Sign-Out / Admin Disable) ---

\* auth.ts:revokeUserSessions / adminUsers.ts:disableAdminUser mutates D1
RevokeInD1 ==
  /\ revokePhase = "idle"
  /\ d1SessionActive' = FALSE
  /\ revokePhase' = "d1_revoked"
  /\ UNCHANGED <<authCacheValid, kickEpoch, wsAccepted, handshakePhase,
                 handshakeReadValid, handshakeEpoch, postKickWriteAllowed>>

\* workspaceYDocDurableObject.ts:504-521 `handleKick` clears `this.authCache = null` and closes accepted sockets
HandleKick ==
  /\ revokePhase = "d1_revoked"
  /\ authCacheValid' = FALSE
  /\ wsAccepted' = FALSE
  /\ kickEpoch' = kickEpoch + 1
  /\ revokePhase' = "kicked"
  /\ UNCHANGED <<d1SessionActive, handshakePhase, handshakeReadValid, handshakeEpoch, postKickWriteAllowed>>

Next ==
  \/ HandshakeStartAuthLookup
  \/ HandshakeFinishAuthLookup
  \/ RevokedSocketMutatesDoc
  \/ RevokeInD1
  \/ HandleKick

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ d1SessionActive \in BOOLEAN
  /\ revokePhase \in {"idle", "d1_revoked", "kicked"}
  /\ authCacheValid \in BOOLEAN
  /\ kickEpoch \in 0..1
  /\ wsAccepted \in BOOLEAN
  /\ handshakePhase \in {"idle", "reading_d1", "done"}
  /\ handshakeReadValid \in BOOLEAN
  /\ handshakeEpoch \in 0..1
  /\ postKickWriteAllowed \in BOOLEAN

\* Safety Promise: Once D1 session revocation AND DO `/kick` have both completed,
\* the revoked session cannot hold an open WebSocket or mutate the workspace via poisoned authCache.
NoPostKickAccess ==
  ~postKickWriteAllowed

NoRevokedSocketOpenAfterKick ==
  (revokePhase = "kicked" /\ handshakePhase = "done") => (~wsAccepted /\ ~authCacheValid)
====
