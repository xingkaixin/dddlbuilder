import type { ForeignKeyDefinition, PersistedState } from '@ddlbuilder/shared-types';

export type ErNodeData = Record<string, unknown> & {
  state: PersistedState;
  onSelectTable: (state: PersistedState) => void;
};

export type ErEdgeData = Record<string, unknown> & {
  fk: ForeignKeyDefinition;
  onDelete: () => Promise<void>;
};
