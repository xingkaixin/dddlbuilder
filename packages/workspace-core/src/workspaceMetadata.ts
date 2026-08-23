export const MISSING_WORKSPACE_TIMESTAMP = 0;

export const readWorkspaceTimestamp = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : MISSING_WORKSPACE_TIMESTAMP;

export const readWorkspaceCreatedAt = (createdAt: unknown, updatedAt: unknown) =>
  typeof createdAt === 'number' && Number.isFinite(createdAt)
    ? createdAt
    : readWorkspaceTimestamp(updatedAt);
