import { savedTableKey, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { memo, useCallback, useMemo, useReducer } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type EdgeChangeset,
  type NodeChangeset,
  type NodeTypes,
  type EdgeTypes,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/style.css';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { ErNodeData, ErEdgeData } from './types';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import type { SavedTableStateUpdate } from '@/utils/savedTableStateUpdate';
import type { SaveTableResult } from '@/hooks/useSavedTables';
import { useTimers } from '@/hooks/useTimers';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import { ErTableNode } from './ErTableNode';
import { ErRelationEdge } from './ErRelationEdge';
import { ErDiagramToolbar } from './ErDiagramToolbar';
import { RelationCreationDialog } from './RelationCreationDialog';
import { planTableRelationship, type TableRelationshipIntent } from './tableRelationship';
import { writeLocalStorageJson } from '@/utils/localStorage';

const GRID_GAP_X = 320;
const GRID_ROW_GAP_Y = 48;
const NODE_HEADER_HEIGHT = 52;
const NODE_FIELD_HEIGHT = 24;
const ER_POSITIONS_STORAGE_KEY = 'ddlbuilder:er-positions:v1';

const NodePositionSchema = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
});
const SavedNodePositionsSchema = Schema.Record(Schema.String, NodePositionSchema);

function readSavedNodePositions(scopeKey: string) {
  const result = new Map<string, { x: number; y: number }>();

  try {
    const raw = window.localStorage.getItem(`${ER_POSITIONS_STORAGE_KEY}:${scopeKey}`);

    if (!raw) return result;

    const decoded = Schema.decodeUnknownOption(SavedNodePositionsSchema)(JSON.parse(raw));

    if (Option.isNone(decoded)) return result;

    for (const [key, value] of Object.entries(decoded.value)) {
      result.set(key, value);
    }

    return result;
  } catch {
    return result;
  }
}

function writeSavedNodePositions(scopeKey: string, nodes: Node[]) {
  const positions = Object.fromEntries(
    nodes.map((node) => [
      node.id,
      { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    ]),
  );

  writeLocalStorageJson(
    `${ER_POSITIONS_STORAGE_KEY}:${scopeKey}`,
    positions,
    '[er-diagram] node position write',
  );
}

function estimateNodeHeight(state: PersistedState): number {
  const fieldCount = (state.rows || []).filter((row) => row.fieldName?.trim()).length;

  return NODE_HEADER_HEIGHT + Math.max(1, fieldCount) * NODE_FIELD_HEIGHT;
}

function computeRowAwarePositions(nodes: Node[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (nodes.length === 0) return positions;

  const cols = Math.ceil(Math.sqrt(nodes.length));
  let currentY = 50;

  for (let rowStart = 0; rowStart < nodes.length; rowStart += cols) {
    const rowNodes = nodes.slice(rowStart, rowStart + cols);
    let maxRowHeight = 160;

    rowNodes.forEach((node, colIndex) => {
      positions.set(node.id, { x: colIndex * GRID_GAP_X + 50, y: currentY });
      // SAFETY: node.data is ErNodeData supplied by buildNodesFromTables.
      const data = node.data as ErNodeData | undefined;
      const height = data?.state ? estimateNodeHeight(data.state) : 160;
      maxRowHeight = Math.max(maxRowHeight, height);
    });

    currentY += maxRowHeight + GRID_ROW_GAP_Y;
  }

  return positions;
}

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
  onSelectTable: (record: SavedTableRecord) => void,
): Node[] {
  return tables.map((record) => ({
    id: buildSavedTableNodeId(record),
    type: 'table',
    position: { x: 50, y: 50 },
    // SAFETY: SavedTableRecord supplies PersistedState for node and edge data.
    data: {
      record,
      state: record.state,
      onSelectTable,
    } as ErNodeData,
  }));
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
  scopeKey: string;
  tables: SavedTableRecord[];
  loading: boolean;
  onSelectTable: (record: SavedTableRecord) => void;
  onRefresh: () => Promise<void>;
  onAddTable: (afterSave: () => void) => void;
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
  | {
      type: 'graphSourceChanged';
      nodes: Node[];
      edges: Edge[];
      savedPositions: Map<string, { x: number; y: number }>;
    }
  | { type: 'nodesChanged'; changes: NodeChangeset }
  | { type: 'edgesChanged'; changes: EdgeChangeset }
  | { type: 'autoLayoutApplied' }
  | { type: 'relationshipProposed'; relationship: PendingRelationship }
  | { type: 'relationshipClosed' };

function createCanvasState(source: {
  nodes: Node[];
  edges: Edge[];
  savedPositions: Map<string, { x: number; y: number }>;
}): CanvasState {
  return {
    sourceNodes: source.nodes,
    sourceEdges: source.edges,
    nodes: placeNodes(source.nodes, source.savedPositions),
    edges: source.edges,
    pendingRelationship: null,
  };
}

function placeNodes(nodes: Node[], known: Map<string, { x: number; y: number }>): Node[] {
  let bottom = 0;
  const missing = [];

  for (const node of nodes) {
    const position = known.get(node.id);

    if (position) {
      // SAFETY: all table nodes carry the schema used to estimate their rendered height.
      const data = node.data as ErNodeData;
      bottom = Math.max(bottom, position.y + estimateNodeHeight(data.state) + GRID_ROW_GAP_Y);
    } else {
      missing.push(node);
    }
  }

  const positions = computeRowAwarePositions(missing);

  return nodes.map((node) => {
    const fixed = known.get(node.id);

    if (fixed) return { ...node, position: fixed };
    const next = positions.get(node.id) ?? node.position;

    return { ...node, position: { x: next.x, y: next.y + bottom } };
  });
}

function gridLayout(nodes: Node[]): Node[] {
  const positions = computeRowAwarePositions(nodes);

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
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
            : placeNodes(
                event.nodes,
                new Map([
                  ...event.savedPositions,
                  ...state.nodes.map((node) => [node.id, node.position] as const),
                ]),
              ),
        edges: event.edges === state.sourceEdges ? state.edges : event.edges,
      };
    case 'nodesChanged':
      return { ...state, nodes: event.changes.applyTo(state.nodes) };
    case 'edgesChanged':
      return { ...state, edges: event.changes.applyTo(state.edges) };
    case 'autoLayoutApplied':
      return { ...state, nodes: gridLayout(state.nodes) };
    case 'relationshipProposed':
      return { ...state, pendingRelationship: event.relationship };
    case 'relationshipClosed':
      return { ...state, pendingRelationship: null };
  }
}

function CanvasInner({
  scopeKey,
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

  const savedPositions = useMemo(() => readSavedNodePositions(scopeKey), [scopeKey]);

  const [state, dispatch] = useReducer(
    canvasReducer,
    { nodes: initialNodes, edges: initialEdges, savedPositions },
    createCanvasState,
  );
  const { nodes, edges, pendingRelationship } = state;

  // Syncing during render keeps dragged positions without committing a stale graph first.
  if (state.sourceNodes !== initialNodes || state.sourceEdges !== initialEdges) {
    dispatch({
      type: 'graphSourceChanged',
      nodes: initialNodes,
      edges: initialEdges,
      savedPositions,
    });
  }

  const onNodesChange = useCallback(
    (changes: NodeChangeset) => dispatch({ type: 'nodesChanged', changes }),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChangeset) => dispatch({ type: 'edgesChanged', changes }),
    [],
  );

  const fitViewSoon = useCallback(() => {
    // React Flow 13 measures padding per side; 8.33% preserves the previous 0.2 ratio.
    schedule(() => fitView({ padding: '8.33%' }), 100);
  }, [fitView, schedule]);

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
      let result: Awaited<ReturnType<typeof onUpdateTable>>;

      try {
        result = await onUpdateTable(pendingRelationship.sourceRecord, (source, readTable) => {
          const target = readTable(pendingRelationship.targetRecord);

          if (!target || target.trashedAt) throw new Error(t('erDiagram.relationship.saveFailed'));
          const planned = planTableRelationship({ source, target: target.state }, intent);

          if (!planned.ok) throw new Error(t(`erDiagram.relationship.errors.${planned.error}`));

          return planned.plan.sourceState;
        });
      } catch {
        showToast(t('erDiagram.relationship.saveFailed'));

        return;
      }

      if (!result.ok) {
        showToast(result.message ?? t('erDiagram.relationship.saveFailed'));

        return;
      }

      dispatch({ type: 'relationshipClosed' });
      showToast(t('erDiagram.relationship.success'));
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- rejected promises may contain any thrown JavaScript value.
      await onRefresh().catch((error: unknown) => {
        console.error('[er-diagram] refresh after relationship save failed', error);
      });
    },
    [onRefresh, onUpdateTable, pendingRelationship, showToast, t],
  );

  const handleAutoLayout = useCallback(() => {
    writeSavedNodePositions(scopeKey, gridLayout(nodes));
    dispatch({ type: 'autoLayoutApplied' });
    schedule(() => fitView({ padding: '8.33%' }), 50);
  }, [fitView, nodes, schedule, scopeKey]);

  const handleNodeDragStop = useCallback(() => {
    writeSavedNodePositions(scopeKey, nodes);
  }, [nodes, scopeKey]);

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
        onNodeDragStop={handleNodeDragStop}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: '8.33%' }}
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
        <ErDiagramToolbar
          onAddTable={() => onAddTable(fitViewSoon)}
          onAutoLayout={handleAutoLayout}
        />
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

export const ErDiagramCanvas = memo(function ErDiagramCanvas({
  scopeKey,
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
        scopeKey={scopeKey}
        tables={tables}
        loading={loading}
        onSelectTable={onSelectTable}
        onRefresh={onRefresh}
        onAddTable={onAddTable}
        onUpdateTable={onUpdateTable}
      />
    </ReactFlowProvider>
  );
});
