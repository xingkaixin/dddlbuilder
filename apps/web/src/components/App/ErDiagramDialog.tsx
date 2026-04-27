import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listSavedTables } from '@/utils/savedTablesDb';

interface ErNode {
  id: string;
  tableName: string;
  schemaName?: string;
  fields: { name: string; type: string; comment: string; isPrimary: boolean }[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ErEdge {
  id: string;
  source: string;
  target: string;
  sourceFields: string[];
  targetFields: string[];
  label: string;
}

interface ErDiagramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTable: (state: PersistedState) => void;
}

const NODE_WIDTH = 220;
const NODE_HEADER_HEIGHT = 36;
const ROW_HEIGHT = 26;
const GRID_GAP_X = 80;
const GRID_GAP_Y = 60;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

function buildErData(tables: { name: string; state: PersistedState }[]): {
  nodes: ErNode[];
  edges: ErEdge[];
} {
  const nodes: ErNode[] = [];
  const edges: ErEdge[] = [];

  // Build nodes
  for (const table of tables) {
    const state = table.state;
    const pkFields = new Set(
      state.indexes
        ?.filter((idx) => idx.isPrimary)
        .flatMap((idx) => idx.fields.map((f) => f.name)) || [],
    );

    const fields = (state.rows || [])
      .filter((row) => row.fieldName?.trim())
      .map((row) => ({
        name: row.fieldName,
        type: row.fieldType || '',
        comment: row.fieldComment || '',
        isPrimary: pkFields.has(row.fieldName),
      }));

    nodes.push({
      id: `${state.schemaName ? `${state.schemaName}.` : ''}${state.tableName}`,
      tableName: state.tableName,
      schemaName: state.schemaName,
      fields,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: NODE_HEADER_HEIGHT + fields.length * ROW_HEIGHT + 8,
    });
  }

  // Build edges from foreign keys
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const table of tables) {
    const state = table.state;
    const sourceId = `${state.schemaName ? `${state.schemaName}.` : ''}${state.tableName}`;

    for (const fk of state.foreignKeys || []) {
      const targetId = `${fk.refSchema ? `${fk.refSchema}.` : ''}${fk.refTable}`;
      if (!nodeMap.has(targetId)) continue;

      edges.push({
        id: `${sourceId}-${fk.name}`,
        source: sourceId,
        target: targetId,
        sourceFields: fk.fields,
        targetFields: fk.refFields,
        label: fk.onDelete || fk.onUpdate ? `${fk.onDelete || '-'} / ${fk.onUpdate || '-'}` : '',
      });
    }
  }

  // Simple grid layout
  const cols = Math.ceil(Math.sqrt(nodes.length));
  nodes.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    node.x = col * (NODE_WIDTH + GRID_GAP_X) + 50;
    node.y = row * (Math.max(...nodes.map((n) => n.height)) + GRID_GAP_Y) + 50;
  });

  return { nodes, edges };
}

function getEdgePath(edge: ErEdge, nodes: ErNode[]): string {
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);
  if (!source || !target) return '';

  const sx = source.x + source.width / 2;
  const sy = source.y + source.height / 2;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;

  // Simple curved path
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  const controlOffset = Math.abs(tx - sx) * 0.2;

  return `M ${sx} ${sy} Q ${midX + controlOffset} ${sy} ${midX} ${midY} T ${tx} ${ty}`;
}

export const ErDiagramDialog = memo<ErDiagramDialogProps>(
  ({ open, onOpenChange, onSelectTable }) => {
    const { t } = useTranslation();
    const [tables, setTables] = useState<{ name: string; state: PersistedState }[]>([]);
    const [loading, setLoading] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragNode, setDragNode] = useState<string | null>(null);
    const dragRef = useRef({ startX: 0, startY: 0, nodeStartX: 0, nodeStartY: 0 });
    const canvasRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      setLoading(true);
      void listSavedTables()
        .then((records) => {
          const loaded = records.map((r) => ({
            name: r.name,
            state: r.state,
          }));
          setTables(loaded);
        })
        .finally(() => setLoading(false));
    }, [open]);

    const { nodes: initialNodes, edges } = useMemo(() => buildErData(tables), [tables]);
    const [nodes, setNodes] = useState<ErNode[]>([]);

    useEffect(() => {
      setNodes(initialNodes);
    }, [initialNodes]);

    const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.2, MAX_ZOOM)), []);
    const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.2, MIN_ZOOM)), []);
    const handleZoomReset = useCallback(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * delta)));
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    }, []);

    const handleNodeMouseDown = useCallback(
      (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        setDragNode(nodeId);
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          nodeStartX: node.x,
          nodeStartY: node.y,
        };
      },
      [nodes],
    );

    const handleCanvasMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (e.target === canvasRef.current || (e.target as HTMLElement).closest('.er-canvas-bg')) {
          setIsDragging(true);
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            nodeStartX: pan.x,
            nodeStartY: pan.y,
          };
        }
      },
      [pan],
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (dragNode) {
          const dx = (e.clientX - dragRef.current.startX) / zoom;
          const dy = (e.clientY - dragRef.current.startY) / zoom;
          setNodes((prev) =>
            prev.map((n) =>
              n.id === dragNode
                ? { ...n, x: dragRef.current.nodeStartX + dx, y: dragRef.current.nodeStartY + dy }
                : n,
            ),
          );
        } else if (isDragging) {
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          setPan({ x: dragRef.current.nodeStartX + dx, y: dragRef.current.nodeStartY + dy });
        }
      },
      [dragNode, isDragging, zoom],
    );

    const handleMouseUp = useCallback(() => {
      setDragNode(null);
      setIsDragging(false);
    }, []);

    const handleSelectTable = useCallback(
      (node: ErNode) => {
        const table = tables.find(
          (tableItem) =>
            tableItem.state.tableName === node.tableName &&
            tableItem.state.schemaName === node.schemaName,
        );
        if (table) {
          onSelectTable(table.state);
          onOpenChange(false);
        }
      },
      [tables, onSelectTable, onOpenChange],
    );

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <span>{t('erDiagram.title')}</span>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleZoomReset}>
                  <Maximize className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div
            ref={canvasRef}
            className="er-canvas-bg relative flex-1 overflow-hidden bg-muted/30 cursor-grab active:cursor-grabbing"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && tables.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                {t('erDiagram.noTables')}
              </div>
            )}

            {!loading && tables.length > 0 && (
              <div
                className="absolute inset-0 origin-top-left"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              >
                {/* SVG Layer for edges */}
                <svg
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    width: '100%',
                    height: '100%',
                    minWidth: 2000,
                    minHeight: 2000,
                  }}
                >
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--muted-foreground))" />
                    </marker>
                  </defs>
                  {edges.map((edge) => (
                    <g key={edge.id}>
                      <path
                        d={getEdgePath(edge, nodes)}
                        fill="none"
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth="1.5"
                        markerEnd="url(#arrowhead)"
                        opacity={0.6}
                      />
                      {edge.label && (
                        <text fontSize="10" fill="hsl(var(--muted-foreground))" textAnchor="middle">
                          <textPath href={`#${edge.id}-path`} startOffset="50%">
                            {edge.label}
                          </textPath>
                        </text>
                      )}
                    </g>
                  ))}
                </svg>

                {/* HTML Layer for nodes */}
                {nodes.map((node) => (
                  <div
                    key={node.id}
                    className="absolute rounded-lg border bg-card shadow-md transition-shadow hover:shadow-lg cursor-pointer select-none"
                    style={{
                      left: node.x,
                      top: node.y,
                      width: node.width,
                    }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onDoubleClick={() => handleSelectTable(node)}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-2 rounded-t-lg bg-primary/10 px-3 py-2">
                      <span className="text-sm font-semibold text-primary truncate">
                        {node.tableName}
                      </span>
                      {node.schemaName && (
                        <span className="text-xs text-muted-foreground truncate">
                          ({node.schemaName})
                        </span>
                      )}
                    </div>
                    {/* Fields */}
                    <div className="px-1 py-1">
                      {node.fields.map((field) => (
                        <div
                          key={field.name}
                          className="flex items-center justify-between gap-2 px-2 py-0.5 text-xs"
                        >
                          <span
                            className={
                              field.isPrimary ? 'font-semibold text-primary' : 'text-foreground'
                            }
                          >
                            {field.isPrimary && '🔑 '}
                            {field.name}
                          </span>
                          <span className="text-muted-foreground truncate">{field.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);

ErDiagramDialog.displayName = 'ErDiagramDialog';
