import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPersistedState = (value: unknown): value is PersistedState => isRecord(value);

export const isWorkspaceSnapshot = (value: unknown): value is WorkspaceSnapshot => {
  if (!isRecord(value)) return false;

  const globalDraft =
    value.globalDraft === null ||
    (isRecord(value.globalDraft) &&
      typeof value.globalDraft.updatedAt === 'number' &&
      isPersistedState(value.globalDraft.state));
  const drafts =
    Array.isArray(value.drafts) &&
    value.drafts.every(
      (item) =>
        isRecord(item) &&
        typeof item.draftId === 'string' &&
        (item.createdAt === undefined || typeof item.createdAt === 'number') &&
        typeof item.updatedAt === 'number' &&
        isPersistedState(item.state) &&
        (item.folderId === undefined || typeof item.folderId === 'string'),
    );
  const savedTables =
    Array.isArray(value.savedTables) &&
    value.savedTables.every(
      (item) =>
        isRecord(item) &&
        typeof item.normalizedName === 'string' &&
        typeof item.name === 'string' &&
        (item.createdAt === undefined || typeof item.createdAt === 'number') &&
        typeof item.updatedAt === 'number' &&
        isPersistedState(item.state),
    );
  const savedDrafts =
    Array.isArray(value.savedDrafts) &&
    value.savedDrafts.every(
      (item) =>
        isRecord(item) &&
        typeof item.normalizedName === 'string' &&
        typeof item.tableName === 'string' &&
        typeof item.baseSignature === 'string' &&
        typeof item.updatedAt === 'number' &&
        isPersistedState(item.state),
    );
  const folders =
    Array.isArray(value.folders) &&
    value.folders.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.order === 'number' &&
        typeof item.createdAt === 'number' &&
        (item.parentId === undefined || typeof item.parentId === 'string'),
    );

  return globalDraft && drafts && savedTables && savedDrafts && folders;
};
