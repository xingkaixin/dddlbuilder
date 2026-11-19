import type { ForeignKeyDefinition, PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';

export type ErNodeData = {
  record: SavedTableRecord;
  state: PersistedState;
  onSelectTable: (record: SavedTableRecord) => void;
};

export type ErEdgeData = {
  fk: ForeignKeyDefinition;
  onDelete: () => Promise<void>;
};
