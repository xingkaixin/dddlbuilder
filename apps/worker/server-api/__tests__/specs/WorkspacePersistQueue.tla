---- MODULE WorkspacePersistQueue ----
\* Formal model of WorkspaceYDocDurableObject persistence & ACK protocol
\* Source: apps/worker/server-api/lib/workspaceYDocDurableObject.ts
\*   - webSocketMessage (lines 183-271)
\*   - queuePersistUpdate (lines 439-446)
\*   - startPersisting (lines 448-461)
\*   - drainPendingUpdates (lines 463-487)
\*   - awaitPersisted (lines 498-501)
\*
\* Promise: Every update acknowledged to a client with `persisted` (so the client
\* treats the workspace as synced and allows sign-out / local IndexedDB deletion)
\* is actually persisted in Durable Object storage and survives a DO restart.

EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  MaxUpdates,       \* bound on client updates (e.g. 2)
  ClearInsideDrain  \* FALSE = current code (clears persistQueue in .then() microtask after drain returns);
                    \* TRUE  = fixed design (clears persistQueue / loops atomically before resolving)

VARIABLES
  nextSeq,          \* this.nextSeq in WorkspaceYDocDurableObject
  docUpdates,       \* set of update seqs applied to in-memory this.doc
  pendingUpdates,   \* sequence of seqs in this.pendingUpdates
  storedUpdates,    \* set of seqs durably written to this.state.storage
  ackedUpdates,     \* set of seqs for which server sent `persisted` ACK to client
  workerState,      \* state of `persist` / `drainPendingUpdates`:
                    \*   "idle"      : this.persistQueue = null
                    \*   "scheduled" : Promise.resolve().then(() => drainPendingUpdates()) queued, persistQueue != null
                    \*   "writing"   : inside await appendWorkspaceYDocUpdates(...)
                    \*   "alarm"     : inside await this.ensureAlarm()
                    \*   "settling"  : drainPendingUpdates() returned (exited while loop),
                    \*                 waiting for persist.then(() => persistQueue = null) microtask!
  batchLen,         \* length of `const pending = this.pendingUpdates.slice()` currently being drained
  waitingAck,       \* set of seqs currently blocked at `await this.awaitPersisted()` on the active persistQueue
  restarted         \* TRUE if DO evicted/restarted from durable storage

vars == <<nextSeq, docUpdates, pendingUpdates, storedUpdates, ackedUpdates, workerState, batchLen, waitingAck, restarted>>

SeqElements(s) == { s[i] : i \in 1..Len(s) }

SubSeqTo(s, n) == SubSeq(s, 1, n)
DropPrefix(s, n) == IF n >= Len(s) THEN <<>> ELSE SubSeq(s, n + 1, Len(s))

Init ==
  /\ nextSeq = 0
  /\ docUpdates = {}
  /\ pendingUpdates = <<>>
  /\ storedUpdates = {}
  /\ ackedUpdates = {}
  /\ workerState = "idle"
  /\ batchLen = 0
  /\ waitingAck = {}
  /\ restarted = FALSE

\* Corresponds to: webSocketMessage -> readSyncMessage -> handleDocUpdate -> queuePersistUpdate -> awaitPersisted
\* When a client sends an update, it applies to this.doc, pushes to pendingUpdates, calls startPersisting(),
\* and waits on `await this.awaitPersisted()` before sending `encodeWorkspaceYDocAcknowledgement(requestId)`.
ReceiveUpdateAndAwaitPersisted ==
  /\ ~restarted
  /\ nextSeq < MaxUpdates
  /\ LET seq == nextSeq + 1
         nextPending == Append(pendingUpdates, seq)
         nextWorker == IF workerState = "idle" THEN "scheduled" ELSE workerState
     IN /\ nextSeq' = seq
        /\ docUpdates' = docUpdates \cup {seq}
        /\ pendingUpdates' = nextPending
        /\ workerState' = nextWorker
        /\ waitingAck' = waitingAck \cup {seq}
        /\ UNCHANGED <<storedUpdates, ackedUpdates, batchLen, restarted>>

\* Corresponds to: microtask starting `drainPendingUpdates()` and checking `while (this.pendingUpdates.length > 0)`
DrainLoopCheck ==
  /\ ~restarted
  /\ workerState = "scheduled"
  /\ IF Len(pendingUpdates) > 0
     THEN /\ batchLen' = Len(pendingUpdates)
          /\ workerState' = "writing"
          /\ UNCHANGED <<nextSeq, docUpdates, pendingUpdates, storedUpdates, ackedUpdates, waitingAck, restarted>>
     ELSE IF ClearInsideDrain
          THEN /\ workerState' = "idle"
               /\ ackedUpdates' = ackedUpdates \cup waitingAck
               /\ waitingAck' = {}
               /\ UNCHANGED <<nextSeq, docUpdates, pendingUpdates, storedUpdates, batchLen, restarted>>
          ELSE /\ workerState' = "settling"
               /\ UNCHANGED <<nextSeq, docUpdates, pendingUpdates, storedUpdates, ackedUpdates, batchLen, restarted>>

\* Corresponds to: `await appendWorkspaceYDocUpdates(this.state.storage, pending, this.storedMeta())` completing
AppendStorageComplete ==
  /\ ~restarted
  /\ workerState = "writing"
  /\ LET written == SeqElements(SubSeqTo(pendingUpdates, batchLen))
     IN /\ storedUpdates' = storedUpdates \cup written
        /\ workerState' = "alarm"
        /\ UNCHANGED <<nextSeq, docUpdates, pendingUpdates, ackedUpdates, batchLen, waitingAck, restarted>>

\* Corresponds to: `await this.ensureAlarm(); this.pendingUpdates.splice(0, pending.length);`
\* followed immediately by the next `while (this.pendingUpdates.length > 0)` check!
EnsureAlarmComplete ==
  /\ ~restarted
  /\ workerState = "alarm"
  /\ LET remaining == DropPrefix(pendingUpdates, batchLen)
     IN /\ pendingUpdates' = remaining
        /\ IF Len(remaining) > 0
           THEN /\ batchLen' = Len(remaining)
                /\ workerState' = "writing"
                /\ UNCHANGED <<nextSeq, docUpdates, storedUpdates, ackedUpdates, waitingAck, restarted>>
           ELSE IF ClearInsideDrain
                THEN \* Fixed: clear persistQueue synchronously before promise resolves, or re-arm if needed
                     /\ batchLen' = 0
                     /\ workerState' = "idle"
                     /\ ackedUpdates' = ackedUpdates \cup waitingAck
                     /\ waitingAck' = {}
                     /\ UNCHANGED <<nextSeq, docUpdates, storedUpdates, restarted>>
                ELSE \* Current code: async drainPendingUpdates() returns while this.persistQueue is STILL `persist`!
                     /\ batchLen' = 0
                     /\ workerState' = "settling"
                     /\ UNCHANGED <<nextSeq, docUpdates, storedUpdates, ackedUpdates, waitingAck, restarted>>

\* Corresponds to: `persist` resolving -> waking `await this.persistQueue` callers (sending `persisted` ACK)
\* AND running `persist.then(() => { if (this.persistQueue === persist) this.persistQueue = null; })`
PersistPromiseSettles ==
  /\ ~restarted
  /\ workerState = "settling"
  /\ workerState' = "idle"
  /\ ackedUpdates' = ackedUpdates \cup waitingAck
  /\ waitingAck' = {}
  /\ UNCHANGED <<nextSeq, docUpdates, pendingUpdates, storedUpdates, batchLen, restarted>>

\* Corresponds to: Durable Object eviction / isolate restart -> reloads `doc` from `this.state.storage` (`loadDoc`)
RestartDO ==
  /\ ~restarted
  /\ restarted' = TRUE
  /\ docUpdates' = storedUpdates
  /\ pendingUpdates' = <<>>
  /\ workerState' = "idle"
  /\ batchLen' = 0
  /\ waitingAck' = {}
  /\ UNCHANGED <<nextSeq, storedUpdates, ackedUpdates>>

Next ==
  \/ ReceiveUpdateAndAwaitPersisted
  \/ DrainLoopCheck
  \/ AppendStorageComplete
  \/ EnsureAlarmComplete
  \/ PersistPromiseSettles
  \/ RestartDO

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ nextSeq \in 0..MaxUpdates
  /\ docUpdates \subseteq 1..MaxUpdates
  /\ storedUpdates \subseteq 1..MaxUpdates
  /\ ackedUpdates \subseteq 1..MaxUpdates
  /\ waitingAck \subseteq 1..MaxUpdates
  /\ workerState \in {"idle", "scheduled", "writing", "alarm", "settling"}
  /\ batchLen \in 0..MaxUpdates
  /\ restarted \in BOOLEAN

\* Safety Promise 1: Server never sends `persisted` ACK for an update that is not in DO storage.
AckImpliesPersisted ==
  ackedUpdates \subseteq storedUpdates

\* Safety Promise 2: No pending update is ever stranded in memory with persistQueue == null (before restart).
NoOrphanedPendingUpdates ==
  (~restarted /\ Len(pendingUpdates) > 0) => (workerState # "idle")

\* Safety Promise 3: After a DO restart, every acknowledged update is still in `doc`.
AckSurvivesRestart ==
  restarted => (ackedUpdates \subseteq docUpdates)
====
