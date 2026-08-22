import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { ErNodeData, ErEdgeData } from '@ddlbuilder/shared-types';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { updateSavedTable, type SavedTableRecord } from '@/utils/savedTablesDb';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import ErTableNode from './ErTableNode';
import ErRelationEdge from './ErRelationEdge';
import ErDiagramToolbar from './ErDiagramToolbar';
import { RelationCreationDialog } from './RelationCreationDialog';
import type { TableRelationshipPlan } from './tableRelationship';

const GRID_GAP_X = 300;
const GRID_GAP_Y = 200;

const nodeTypes: NodeTypes = { table: ErTableNode as unknown as NodeTypes[string] };
const edgeTypes: EdgeTypes = { relation: ErRelationEdge as unknown as EdgeTypes[string] };

function buildTableReferenceId(state: PersistedState): string {
  return `${state.schemaName ? `${state.schemaName}.` : ''}${state.tableName}`;
}

function buildSavedTableNodeId(record: SavedTableRecord): string {
  return record.normalizedName;
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
      data: {
        state: record.state,
        onSelectTable,
      } as ErNodeData,
    };
  });
}

function buildEdgesFromTables(tables: SavedTableRecord[]): Edge[] {
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
        id: fk.id,
        source: sourceId,
        target: targetId,
        sourceHandle: fk.fields[0],
        targetHandle: fk.refFields[0],
        type: 'relation',
        data: {
          fk,
          sourceTable: table.state.tableName,
          targetTable: fk.refTable,
          onDelete: () => {},
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
  onAddTable: () => void;
  workspaceScope: WorkspaceScope | null;
}

type PendingRelationship = {
  sourceRecord: SavedTableRecord;
  targetRecord: SavedTableRecord;
  sourceField: string;
  targetField: string;
};

function CanvasInner({
  tables,
  loading,
  onSelectTable,
  onRefresh,
  onAddTable,
  workspaceScope,
}: CanvasInnerProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { fitView } = useReactFlow();

  const initialNodes = useMemo(
    () => buildNodesFromTables(tables, onSelectTable),
    [tables, onSelectTable],
  );
  const initialEdges = useMemo(() => buildEdgesFromTables(tables), [tables]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [pendingRelationship, setPendingRelationship] = useState<PendingRelationship | null>(null);

  useEffect(() => {
    setNodes((prev: Node[]) => {
      const prevPositions = new Map(prev.map((n: Node) => [n.id, n.position]));
      return initialNodes.map((n: Node) => {
        const pos = prevPositions.get(n.id);
        if (pos) {
          return { ...n, position: pos };
        }
        return n;
      });
    });
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  useEffect(() => {
    if (!loading && tables.length > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.2 }), 100);
      return () => clearTimeout(timer);
    }
  }, [loading, tables.length, fitView]);

  const handleDeleteForeignKey = useCallback(
    async (fkId: string) => {
      if (!workspaceScope) return;
      const sourceRecord = tables.find((t) => t.state.foreignKeys?.some((fk) => fk.id === fkId));
      if (!sourceRecord) return;

      const updatedState: PersistedState = {
        ...sourceRecord.state,
        foreignKeys: sourceRecord.state.foreignKeys?.filter((fk) => fk.id !== fkId) || [],
      };

      await updateSavedTable(
        {
          ...sourceRecord,
          state: updatedState,
          updatedAt: Date.now(),
        },
        workspaceScope,
      );

      await onRefresh();
      showToast(t('erDiagram.toast.fkDeleted'));
    },
    [onRefresh, showToast, t, tables, workspaceScope],
  );

  useEffect(() => {
    setEdges((prev: Edge[]) =>
      prev.map((e: Edge) => {
        if (!e.data) return e;
        return {
          ...e,
          data: {
            ...e.data,
            onDelete: handleDeleteForeignKey,
          },
        };
      }),
    );
  }, [handleDeleteForeignKey, setEdges]);

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

      setPendingRelationship({
        sourceRecord,
        targetRecord,
        sourceField: connection.sourceHandle,
        targetField: connection.targetHandle,
      });
    },
    [tables],
  );

  const handleCreateRelationship = useCallback(
    async (plan: TableRelationshipPlan) => {
      if (!pendingRelationship || !workspaceScope) return;

      try {
        await updateSavedTable(
          {
            ...pendingRelationship.sourceRecord,
            state: plan.sourceState,
            updatedAt: Date.now(),
          },
          workspaceScope,
        );
        await onRefresh();
        setPendingRelationship(null);
        showToast(t('erDiagram.relationship.success'));
      } catch {
        showToast(t('erDiagram.relationship.saveFailed'));
      }
    },
    [onRefresh, pendingRelationship, showToast, t, workspaceScope],
  );

  const handleAutoLayout = useCallback(() => {
    setNodes((prev: Node[]) => {
      const cols = Math.ceil(Math.sqrt(prev.length));
      return prev.map((node: Node, index: number) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
          ...node,
          position: { x: col * GRID_GAP_X + 50, y: row * GRID_GAP_Y + 50 },
        };
      });
    });
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [setNodes, fitView]);

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
        <ErDiagramToolbar onAddTable={onAddTable} onAutoLayout={handleAutoLayout} />
      </ReactFlow>
      {pendingRelationship && (
        <RelationCreationDialog
          key={`${pendingRelationship.sourceRecord.normalizedName}:${pendingRelationship.targetRecord.normalizedName}:${pendingRelationship.sourceField}:${pendingRelationship.targetField}`}
          draft={{
            source: pendingRelationship.sourceRecord.state,
            target: pendingRelationship.targetRecord.state,
          }}
          sourceField={pendingRelationship.sourceField}
          targetField={pendingRelationship.targetField}
          onCancel={() => setPendingRelationship(null)}
          onConfirm={handleCreateRelationship}
        />
      )}
    </>
  );
}

interface ErDiagramCanvasProps {
  tables: SavedTableRecord[];
  loading: boolean;
  onSelectTable: (state: PersistedState) => void;
  onRefresh: () => Promise<void>;
  onAddTable: () => void;
  workspaceScope: WorkspaceScope | null;
}

function ErDiagramCanvas({
  tables,
  loading,
  onSelectTable,
  onRefresh,
  onAddTable,
  workspaceScope,
}: ErDiagramCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner
        tables={tables}
        loading={loading}
        onSelectTable={onSelectTable}
        onRefresh={onRefresh}
        onAddTable={onAddTable}
        workspaceScope={workspaceScope}
      />
    </ReactFlowProvider>
  );
}

export default memo(ErDiagramCanvas);
