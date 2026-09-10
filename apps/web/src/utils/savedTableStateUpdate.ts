import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import type { SavedTableRecord } from './workspaceStorageTypes';

type SavedTableReader = (target: SavedTableTarget) => SavedTableRecord | null;

export type SavedTableStateUpdate =
  | PersistedState
  | ((current: PersistedState, readTable: SavedTableReader) => PersistedState);

export function applySavedTableStateUpdate(
  target: SavedTableTarget,
  update: SavedTableStateUpdate,
  readTable: SavedTableReader,
): SavedTableRecord | null {
  const record = readTable(target);

  if (!record || record.trashedAt) return null;

  return {
    ...record,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this is the declared value/updater union.
    state: typeof update === 'function' ? update(record.state, readTable) : update,
    updatedAt: Date.now(),
  };
}
