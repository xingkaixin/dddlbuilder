# DDLBuilder Domain

DDLBuilder helps a user design database schemas, preserve workspace state, and spend credits on assisted schema operations.

## Workspace

**Workspace**:
A user's isolated schema-design environment containing drafts, saved tables, saved-table drafts, and folders.

**Workspace Entity**:
One independently addressable piece of workspace state whose changes can be synchronized.
_Avoid_: Snapshot record, Yjs item

**Workspace Version**:
The monotonically increasing commit position of a successfully stored Workspace Entity change.
_Avoid_: Sequence allocation, tentative version

**Workspace Document**:
The Yjs representation of a Workspace used for collaborative persistence and transport.
_Avoid_: Snapshot

**Initialized Workspace Document**:
A Workspace Document whose schema version has been established, even when all entity collections
are empty. An initialized empty document is authoritative and must not be replaced by legacy data.
_Avoid_: Non-empty document

**Draft**:
Editable schema state that has not become a Saved Table.
_Avoid_: Temporary table

**Saved Table**:
A named schema state deliberately preserved by the user.
_Avoid_: Snapshot

**Saved-Table Draft**:
Uncommitted edits derived from a Saved Table while preserving the Saved Table as the comparison base.
_Avoid_: Saved draft

**Table Relationship**:
A dependency from one table's local fields to a referenced key. Its cardinality and optionality are
derived from uniqueness and field nullability rather than stored independently.
_Avoid_: ER edge, connector

**Trash Entry**:
A soft-deleted Draft or Saved Table retained in the workspace document until it is restored or permanently deleted. The deletion timestamp is synchronized across devices.
_Avoid_: Local-only deleted entity

## AI Usage and Credits

**Credit Account**:
A user's current balance available for assisted schema operations.
_Avoid_: Wallet

**Credit Ledger Entry**:
The immutable record of one committed Credit Account mutation.
_Avoid_: Balance update

**AI Usage Reservation**:
A temporary allocation of credits for one authenticated assisted schema operation before its final usage is known.
_Avoid_: Charge, usage event

**AI Usage**:
The settled resource consumption of one assisted schema operation, including its terminal outcome.
_Avoid_: Request

**Usage Identity**:
The server-issued identity that makes reserving and settling one AI Usage idempotent within its user and operation.
_Avoid_: Request ID

**Request ID**:
A correlation value used to trace one transport attempt. It does not identify a billable operation.
_Avoid_: Idempotency key

## Migration

**Workspace Import**:
The idempotent adoption of local workspace state into a user's Workspace.
_Avoid_: Migration commit
