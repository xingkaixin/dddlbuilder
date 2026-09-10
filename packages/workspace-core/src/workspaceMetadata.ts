/* oxlint-disable anti-slop/no-runtime-typeof -- These helpers normalize raw Y.Doc metadata at its persistence boundary. */
/* oxlint-disable anti-slop/no-unknown-parameters -- Metadata values are raw persisted values until normalized. */

export const MISSING_WORKSPACE_TIMESTAMP = 0;

export const readWorkspaceTimestamp = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : MISSING_WORKSPACE_TIMESTAMP;

export const readWorkspaceCreatedAt = (createdAt: unknown, updatedAt: unknown) =>
  typeof createdAt === 'number' && Number.isFinite(createdAt)
    ? createdAt
    : readWorkspaceTimestamp(updatedAt);
