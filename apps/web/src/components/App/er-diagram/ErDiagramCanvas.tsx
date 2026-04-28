import { memo, useCallback, useEffect, useMemo } from 'react';
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
import type { PersistedState, ForeignKeyDefinition } from '@ddlbuilder/shared-types';
import type { ErNodeData, ErEdgeData } from '@ddlbuilder/shared-types';
import { updateSavedTable, type SavedTableRecord } from '@/utils/savedTablesDb';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import ErTableNode from './ErTableNode';
import ErRelationEdge from './ErRelationEdge';
import ErDiagramToolbar from './ErDiagramToolbar';

const GRID_GAP_X = 300;
const GRID_GAP_Y = 200;

const nodeTypes: NodeTypes = { table: ErTableNode as unknown as NodeTypes[string] };
const edgeTypes: EdgeTypes = { relation: ErRelationEdge as unknown as EdgeTypes[string] };

function buildNodeId(state: PersistedState): string {
  return `${state.schemaName ? `${state.schemaName}.` : ''}${state.tableName}`;
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
      id: buildNodeId(record.state),
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
  const nodeMap = new Map(tables.map((t) => [buildNodeId(t.state), t.state]));

  for (const table of tables) {
    const sourceId = buildNodeId(table.state);
    for (const fk of table.state.foreignKeys || []) {
      const targetId = `${fk.refSchema ? `${fk.refSchema}.` : ''}${fk.refTable}`;
      if (!nodeMap.has(targetId)) continue;

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
}

function CanvasInner({ tables, loading, onSelectTable, onRefresh, onAddTable }: CanvasInnerProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { fitView } = useReactFlow();

  const initialNodes = useMemo(
    () => buildNodesFromTables(tables, onSelectTable),
    [tables, onSelectTable],
  );
  const initialEdges = useMemo(() => buildEdgesFromTables(tables), [tables]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes((prev) => {
      const prevPositions = new Map(prev.map((n) => [n.id, n.position]));
      return initialNodes.map((n) => {
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
      const sourceRecord = tables.find((t) => t.state.foreignKeys?.some((fk) => fk.id === fkId));
      if (!sourceRecord) return;

      const updatedState: PersistedState = {
        ...sourceRecord.state,
        foreignKeys: sourceRecord.state.foreignKeys?.filter((fk) => fk.id !== fkId) || [],
      };

      await updateSavedTable({
        ...sourceRecord,
        state: updatedState,
        updatedAt: Date.now(),
      });

      await onRefresh();
      showToast(t('erDiagram.toast.fkDeleted'));
    },
    [tables, onRefresh, showToast, t],
  );

  useEffect(() => {
    setEdges((prev) =>
      prev.map((e) => {
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
    async (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle ||
        !connection.targetHandle
      ) {
        return;
      }

      const sourceRecord = tables.find((t) => buildNodeId(t.state) === connection.source);
      const targetRecord = tables.find((t) => buildNodeId(t.state) === connection.target);
      if (!sourceRecord || !targetRecord) return;

      if (connection.source === connection.target) {
        showToast(t('erDiagram.fkCreate.selfReference'));
        return;
      }

      const fk: ForeignKeyDefinition = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: `fk_${sourceRecord.state.tableName}_${connection.sourceHandle}_to_${targetRecord.state.tableName}`,
        fields: [connection.sourceHandle],
        refSchema: targetRecord.state.schemaName || undefined,
        refTable: targetRecord.state.tableName,
        refFields: [connection.targetHandle],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      };

      const updatedState: PersistedState = {
        ...sourceRecord.state,
        foreignKeys: [...(sourceRecord.state.foreignKeys || []), fk],
      };

      await updateSavedTable({
        ...sourceRecord,
        state: updatedState,
        updatedAt: Date.now(),
      });

      await onRefresh();
      showToast(t('erDiagram.fkCreate.success'));
    },
    [tables, onRefresh, showToast, t],
  );

  const handleAutoLayout = useCallback(() => {
    setNodes((prev) => {
      const cols = Math.ceil(Math.sqrt(prev.length));
      return prev.map((node, index) => {
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
  );
}

interface ErDiagramCanvasProps {
  tables: SavedTableRecord[];
  loading: boolean;
  onSelectTable: (state: PersistedState) => void;
  onRefresh: () => Promise<void>;
  onAddTable: () => void;
}

function ErDiagramCanvas({
  tables,
  loading,
  onSelectTable,
  onRefresh,
  onAddTable,
}: ErDiagramCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner
        tables={tables}
        loading={loading}
        onSelectTable={onSelectTable}
        onRefresh={onRefresh}
        onAddTable={onAddTable}
      />
    </ReactFlowProvider>
  );
}

export default memo(ErDiagramCanvas);
