import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Key } from '@/components/icons';
import type { ErNodeData } from './types';

function ErTableNode(props: NodeProps) {
  const { data, selected } = props as NodeProps & { data: ErNodeData };
  const { state, onSelectTable } = data;

  const pkFields = new Set(
    state.indexes?.filter((idx) => idx.isPrimary).flatMap((idx) => idx.fields.map((f) => f.name)) ||
      [],
  );

  const fields = (state.rows || [])
    .filter((row) => row.fieldName?.trim())
    .map((row) => ({
      name: row.fieldName,
      type: row.fieldType || '',
      isPrimary: pkFields.has(row.fieldName),
    }));

  return (
    <div
      className={`rounded-lg border bg-card shadow-md transition-shadow hover:shadow-lg cursor-pointer select-none min-w-[220px] ${selected ? 'ring-2 ring-primary' : ''}`}
      onDoubleClick={() => onSelectTable?.(state)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-lg bg-primary/10 px-3 py-2">
        <span className="text-sm font-semibold text-primary truncate">{state.tableName}</span>
        {state.schemaName && (
          <span className="text-xs text-muted-foreground truncate">({state.schemaName})</span>
        )}
      </div>

      {/* Fields */}
      <div className="px-1 py-1">
        {fields.map((field) => (
          <div
            key={field.name}
            className="relative flex items-center justify-between gap-2 px-2 py-0.5 text-xs"
          >
            {/* Source Handle (left side — for creating FK from this field) */}
            <Handle
              type="source"
              id={field.name}
              position={Position.Left}
              style={{
                left: -5,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 10,
                height: 10,
                background: 'hsl(var(--primary))',
                border: '2px solid hsl(var(--background))',
              }}
            />

            <span className={field.isPrimary ? 'font-semibold text-primary' : 'text-foreground'}>
              {field.isPrimary && <Key className="inline h-3 w-3 mr-0.5" />}
              {field.name}
            </span>
            <span className="text-muted-foreground truncate">{field.type}</span>

            {/* Target Handle (right side — for being referenced by FK) */}
            <Handle
              type="target"
              id={field.name}
              position={Position.Right}
              style={{
                right: -5,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 10,
                height: 10,
                background: 'hsl(var(--primary))',
                border: '2px solid hsl(var(--background))',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(ErTableNode);
