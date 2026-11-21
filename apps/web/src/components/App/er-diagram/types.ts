import type { ForeignKeyDefinition, PersistedState } from '@ddlbuilder/shared-types';
import type { Edge, Node } from '@xyflow/react';
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

export type ErNode = Node<ErNodeData>;

export type ErEdge = Edge<ErEdgeData>;
