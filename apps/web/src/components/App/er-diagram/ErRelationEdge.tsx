import { memo, useCallback } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import { X } from 'lucide-react';
import type { ErEdgeData } from '@ddlbuilder/shared-types';

function ErRelationEdge(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    markerEnd,
  } = props as EdgeProps & { data: ErEdgeData };

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const handleDelete = useCallback(() => {
    if (data?.fk?.id) {
      data.onDelete(data.fk.id);
    }
  }, [data]);

  const label =
    data?.fk?.onDelete || data?.fk?.onUpdate
      ? `${data.fk.onDelete || '-'} / ${data.fk.onUpdate || '-'}`
      : '';

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: 2,
          stroke: selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          opacity: selected ? 1 : 0.7,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            fontSize: 10,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          {label && (
            <span className="bg-background/90 px-1 py-0.5 rounded border border-border whitespace-nowrap">
              {label}
            </span>
          )}
          {(selected || data?.fk) && (
            <button
              type="button"
              onClick={handleDelete}
              className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground w-4 h-4 hover:bg-destructive/80 transition-colors"
              title="删除关系"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(ErRelationEdge);
