import { savedTableKey, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { memo, useCallback, useMemo, useReducer } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { ErNodeData, ErEdgeData } from './types';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import type { SavedTableStateUpdate } from '@/utils/savedTableStateUpdate';
import type { SaveTableResult } from '@/hooks/useSavedTables';
import { useTimers } from '@/hooks/useTimers';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import ErTableNode from './ErTableNode';
import ErRelationEdge from './ErRelationEdge';
import ErDiagramToolbar from './ErDiagramToolbar';
import { RelationCreationDialog } from './RelationCreationDialog';
import { planTableRelationship, type TableRelationshipIntent } from './tableRelationship';

const GRID_GAP_X = 300;
const GRID_GAP_Y = 200;

const nodeTypes: NodeTypes = { table: ErTableNode };
const edgeTypes: EdgeTypes = { relation: ErRelationEdge };

function buildTableReferenceId(state: PersistedState): string {
  return `${state.schemaName ? `${state.schemaName}.` : ''}${state.tableName}`;
}

function buildSavedTableNodeId(record: SavedTableRecord): string {
  return savedTableKey(record);
}

function buildNodesFromTables(
  tables: SavedTableRecord[],
  onSelectTable: (state: PersistedState) => void,
): Node[] {
  return tables.map((record, index) => {
    const cols = Math.ceil(Math.sqrt(tables.length));
    const col = index % cols;
    const row = Math.floor(index / cols);

    return {
      id: buildSavedTableNodeId(record),
      type: 'table',
      position: { x: col * GRID_GAP_X + 50, y: row * GRID_GAP_Y + 50 },
      // SAFETY: SavedTableRecord supplies PersistedState for node and edge data.
      data: {
        state: record.state,
        onSelectTable,
      } as ErNodeData,
    };
  });
}

function buildEdgesFromTables(
  tables: SavedTableRecord[],
  onDelete: (table: SavedTableRecord, fkId: string) => Promise<void>,
): Edge[] {
  const edges: Edge[] = [];
  const recordsByReference = new Map<string, SavedTableRecord[]>();

  for (const record of tables) {
    const referenceId = buildTableReferenceId(record.state);
    const records = recordsByReference.get(referenceId) ?? [];
    records.push(record);
    recordsByReference.set(referenceId, records);
  }

  for (const table of tables) {
    const sourceId = buildSavedTableNodeId(table);
    const sourceReferenceId = buildTableReferenceId(table.state);

    for (const fk of table.state.foreignKeys || []) {
      const targetReferenceId = `${fk.refSchema ? `${fk.refSchema}.` : ''}${fk.refTable}`;
      const targetRecords = recordsByReference.get(targetReferenceId) ?? [];
      const onlyTargetRecord = targetRecords.length === 1 ? targetRecords[0] : undefined;

      const targetId =
        targetReferenceId === sourceReferenceId
          ? sourceId
          : onlyTargetRecord
            ? buildSavedTableNodeId(onlyTargetRecord)
            : null;

      if (!targetId) continue;

      if (!fk.fields.length || !fk.refFields.length) continue;

      edges.push({
        id: JSON.stringify([sourceId, fk.id]),
        source: sourceId,
        target: targetId,
        sourceHandle: fk.fields[0],
        targetHandle: fk.refFields[0],
        type: 'relation',
        // SAFETY: SavedTableRecord supplies PersistedState for node and edge data.
        data: {
          fk,
          onDelete: () => onDelete(table, fk.id),
        } as ErEdgeData,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
  }

  return edges;
}

interface CanvasInnerProps {
  tables: SavedTableRecord[];
  loading: boolean;
  onSelectTable: (state: PersistedState) => void;
  onRefresh: () => Promise<void>;
  onAddTable: () => Promise<boolean>;
  onUpdateTable: (
    normalizedName: SavedTableTarget,
    state: SavedTableStateUpdate,
  ) => Promise<SaveTableResult>;
}

type PendingRelationship = {
  sourceRecord: SavedTableRecord;
  targetRecord: SavedTableRecord;
  sourceField: string;
  targetField: string;
};

type CanvasState = {
  sourceNodes: Node[];
  sourceEdges: Edge[];
  nodes: Node[];
  edges: Edge[];
  pendingRelationship: PendingRelationship | null;
};

type CanvasEvent =
  | { type: 'graphSourceChanged'; nodes: Node[]; edges: Edge[] }
  | { type: 'nodesChanged'; changes: NodeChange[] }
  | { type: 'edgesChanged'; changes: EdgeChange[] }
  | { type: 'autoLayoutApplied' }
  | { type: 'relationshipProposed'; relationship: PendingRelationship }
  | { type: 'relationshipClosed' };

function createCanvasState(source: { nodes: Node[]; edges: Edge[] }): CanvasState {
  return {
    sourceNodes: source.nodes,
    sourceEdges: source.edges,
    nodes: source.nodes,
    edges: source.edges,
    pendingRelationship: null,
  };
}

function keepNodePositions(previous: Node[], next: Node[]): Node[] {
  const previousPositions = new Map(previous.map((node) => [node.id, node.position]));

  return next.map((node) => {
    const position = previousPositions.get(node.id);

    return position ? { ...node, position } : node;
  });
}

function gridLayout(nodes: Node[]): Node[] {
  const cols = Math.ceil(Math.sqrt(nodes.length));

  return nodes.map((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    return {
      ...node,
      position: { x: col * GRID_GAP_X + 50, y: row * GRID_GAP_Y + 50 },
    };
  });
}

function canvasReducer(state: CanvasState, event: CanvasEvent): CanvasState {
  switch (event.type) {
    case 'graphSourceChanged':
      return {
        ...state,
        sourceNodes: event.nodes,
        sourceEdges: event.edges,
        nodes:
          event.nodes === state.sourceNodes
            ? state.nodes
            : keepNodePositions(state.nodes, event.nodes),
        edges: event.edges === state.sourceEdges ? state.edges : event.edges,
      };
    case 'nodesChanged':
      return { ...state, nodes: applyNodeChanges(event.changes, state.nodes) };
    case 'edgesChanged':
      return { ...state, edges: applyEdgeChanges(event.changes, state.edges) };
    case 'autoLayoutApplied':
      return { ...state, nodes: gridLayout(state.nodes) };
    case 'relationshipProposed':
      return { ...state, pendingRelationship: event.relationship };
    case 'relationshipClosed':
      return { ...state, pendingRelationship: null };
  }
}

function CanvasInner({
  tables,
  loading,
  onSelectTable,
  onRefresh,
  onAddTable,
  onUpdateTable,
}: CanvasInnerProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { fitView } = useReactFlow();
  const { schedule } = useTimers();

  const handleDeleteForeignKey = useCallback(
    async (sourceRecord: SavedTableRecord, fkId: string) => {
      const result = await onUpdateTable(sourceRecord, (current) => ({
        ...current,
        foreignKeys: current.foreignKeys?.filter((fk) => fk.id !== fkId) || [],
      }));

      if (!result.ok) {
        showToast(result.message ?? t('erDiagram.relationship.saveFailed'));

        return;
      }

      await onRefresh();
      showToast(t('erDiagram.toast.fkDeleted'));
    },
    [onRefresh, onUpdateTable, showToast, t],
  );

  const initialNodes = useMemo(
    () => buildNodesFromTables(tables, onSelectTable),
    [tables, onSelectTable],
  );
  const initialEdges = useMemo(
    () => buildEdgesFromTables(tables, handleDeleteForeignKey),
    [tables, handleDeleteForeignKey],
  );

  const [state, dispatch] = useReducer(
    canvasReducer,
    { nodes: initialNodes, edges: initialEdges },
    createCanvasState,
  );
  const { nodes, edges, pendingRelationship } = state;

  // Syncing during render keeps dragged positions without committing a stale graph first.
  if (state.sourceNodes !== initialNodes || state.sourceEdges !== initialEdges) {
    dispatch({ type: 'graphSourceChanged', nodes: initialNodes, edges: initialEdges });
  }

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => dispatch({ type: 'nodesChanged', changes }),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => dispatch({ type: 'edgesChanged', changes }),
    [],
  );

  const fitViewSoon = useCallback(() => {
    schedule(() => fitView({ padding: 0.2 }), 100);
  }, [fitView, schedule]);

  const handleAddTable = useCallback(() => {
    void onAddTable().then((added) => {
      if (added) fitViewSoon();
    });
  }, [fitViewSoon, onAddTable]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle ||
        !connection.targetHandle
      ) {
        return;
      }

      const sourceRecord = tables.find(
        (table) => buildSavedTableNodeId(table) === connection.source,
      );
      const targetRecord = tables.find(
        (table) => buildSavedTableNodeId(table) === connection.target,
      );

      if (!sourceRecord || !targetRecord) return;

      dispatch({
        type: 'relationshipProposed',
        relationship: {
          sourceRecord,
          targetRecord,
          sourceField: connection.sourceHandle,
          targetField: connection.targetHandle,
        },
      });
    },
    [tables],
  );

  const handleCreateRelationship = useCallback(
    async (intent: TableRelationshipIntent) => {
      if (!pendingRelationship) return;

      try {
        const result = await onUpdateTable(
          pendingRelationship.sourceRecord,
          (source, readTable) => {
            const target = readTable(pendingRelationship.targetRecord);

            if (!target || target.trashedAt)
              throw new Error(t('erDiagram.relationship.saveFailed'));
            const planned = planTableRelationship({ source, target: target.state }, intent);

            if (!planned.ok) throw new Error(t(`erDiagram.relationship.errors.${planned.error}`));

            return planned.plan.sourceState;
          },
        );

        if (!result.ok) {
          showToast(result.message ?? t('erDiagram.relationship.saveFailed'));

          return;
        }

        await onRefresh();
        dispatch({ type: 'relationshipClosed' });
        showToast(t('erDiagram.relationship.success'));
      } catch {
        showToast(t('erDiagram.relationship.saveFailed'));
      }
    },
    [onRefresh, onUpdateTable, pendingRelationship, showToast, t],
  );

  const handleAutoLayout = useCallback(() => {
    dispatch({ type: 'autoLayoutApplied' });
    schedule(() => fitView({ padding: 0.2 }), 50);
  }, [fitView, schedule]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted-foreground">
        {t('erDiagram.noTables')}
      </div>
    );
  }

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        onInit={fitViewSoon}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor={() => 'hsl(var(--primary))'}
          maskColor="hsl(var(--background) / 0.8)"
        />
        <ErDiagramToolbar onAddTable={handleAddTable} onAutoLayout={handleAutoLayout} />
      </ReactFlow>
      {pendingRelationship && (
        <RelationCreationDialog
          key={`${savedTableKey(pendingRelationship.sourceRecord)}:${savedTableKey(pendingRelationship.targetRecord)}:${pendingRelationship.sourceField}:${pendingRelationship.targetField}`}
          draft={{
            source: pendingRelationship.sourceRecord.state,
            target: pendingRelationship.targetRecord.state,
          }}
          sourceField={pendingRelationship.sourceField}
          targetField={pendingRelationship.targetField}
          onCancel={() => dispatch({ type: 'relationshipClosed' })}
          onConfirm={handleCreateRelationship}
        />
      )}
    </>
  );
}

function ErDiagramCanvas({
  tables,
  loading,
  onSelectTable,
  onRefresh,
  onAddTable,
  onUpdateTable,
}: CanvasInnerProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner
        tables={tables}
        loading={loading}
        onSelectTable={onSelectTable}
        onRefresh={onRefresh}
        onAddTable={onAddTable}
        onUpdateTable={onUpdateTable}
      />
    </ReactFlowProvider>
  );
}

export default memo(ErDiagramCanvas);
