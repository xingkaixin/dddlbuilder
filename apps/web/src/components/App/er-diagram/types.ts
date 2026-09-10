import type { ForeignKeyDefinition, PersistedState } from '@ddlbuilder/shared-types';

export type ErNodeData = {
  state: PersistedState;
  onSelectTable: (state: PersistedState) => void;
};

export type ErEdgeData = {
  fk: ForeignKeyDefinition;
  onDelete: () => Promise<void>;
};
