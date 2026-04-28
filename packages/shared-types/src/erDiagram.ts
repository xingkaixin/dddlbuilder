import type { PersistedState, ForeignKeyDefinition } from './index.js';

export type ErNodeData = Record<string, unknown> & {
  state: PersistedState;
  onSelectTable: (state: PersistedState) => void;
};

export type ErEdgeData = Record<string, unknown> & {
  fk: ForeignKeyDefinition;
  sourceTable: string;
  targetTable: string;
  onDelete: (fkId: string) => void;
};
