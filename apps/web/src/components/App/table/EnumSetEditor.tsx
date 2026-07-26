import { memo, useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragDropVerticalIcon, Plus, Trash2 } from '@/components/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { EnumValueMeta } from '@ddlbuilder/shared-types';
import { useTranslation } from 'react-i18next';

export const ENUM_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
  '#84cc16',
];

interface EnumItem {
  id: string;
  value: string;
  color: string;
  zhComment: string;
  enComment: string;
}

function parseEnumValues(fieldType: string): string[] {
  const match = fieldType.match(/^(?:enum|set)\s*\((.*)\)\s*$/i);
  if (!match) return [];
  const inner = match[1].trim();
  if (!inner) return [];

  const values: string[] = [];
  let i = 0;

  while (i < inner.length) {
    while (i < inner.length && (inner[i] === ',' || inner[i] === ' ')) i++;
    if (i >= inner.length) break;

    if (inner[i] === "'") {
      i++;
      let value = '';
      while (i < inner.length) {
        if (inner[i] === "'" && inner[i + 1] === "'") {
          value += "'";
          i += 2;
        } else if (inner[i] === "'") {
          i++;
          break;
        } else {
          value += inner[i++];
        }
      }
      values.push(value);
    } else {
      let value = '';
      while (i < inner.length && inner[i] !== ',') {
        value += inner[i++];
      }
      value = value.trim();
      if (value) values.push(value);
    }
  }

  return values;
}

export function serializeEnumType(baseType: string, values: string[]): string {
  if (values.length === 0) return baseType.toUpperCase();
  const quoted = values.map((v) => `'${v.replace(/'/g, "''")}'`);
  return `${baseType.toUpperCase()}(${quoted.join(',')})`;
}

function metaToItems(parsedValues: string[], enumMeta: EnumValueMeta[] | undefined): EnumItem[] {
  const metaMap = new Map<string, EnumValueMeta>(enumMeta?.map((m) => [m.value, m]) ?? []);
  return parsedValues.map((value, idx) => {
    const meta = metaMap.get(value);
    return {
      id: `${value}-${idx}`,
      value,
      color: meta?.color ?? ENUM_COLORS[idx % ENUM_COLORS.length],
      zhComment: meta?.i18n?.['zh-CN'] ?? '',
      enComment: meta?.i18n?.['en-US'] ?? '',
    };
  });
}

function itemsToMeta(items: EnumItem[]): EnumValueMeta[] {
  return items.map(({ value, color, zhComment, enComment }) => {
    const i18n: Record<string, string> = {};
    if (zhComment) i18n['zh-CN'] = zhComment;
    if (enComment) i18n['en-US'] = enComment;
    return { value, color, ...(Object.keys(i18n).length > 0 ? { i18n } : {}) };
  });
}

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

const ColorPicker = memo<ColorPickerProps>(({ color, onChange }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        className="h-5 w-5 shrink-0 rounded-full border border-border/50 outline-none focus:ring-1 focus:ring-primary/50"
        style={{ backgroundColor: color }}
        aria-label="选择颜色"
      />
    </PopoverTrigger>
    <PopoverContent className="w-auto p-2" align="start">
      <div className="grid grid-cols-5 gap-1">
        {ENUM_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={cn(
              'h-6 w-6 rounded-full border-2 outline-none transition-transform hover:scale-110 focus:ring-1 focus:ring-primary/50',
              c === color ? 'border-foreground' : 'border-transparent',
            )}
            style={{ backgroundColor: c }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
      </div>
    </PopoverContent>
  </Popover>
));
ColorPicker.displayName = 'ColorPicker';

interface SortableItemProps {
  item: EnumItem;
  onUpdate: (id: string, patch: Partial<EnumItem>) => void;
  onDelete: (id: string) => void;
  duplicates: Set<string>;
}

const SortableItem = memo<SortableItemProps>(({ item, onUpdate, onDelete, duplicates }) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-start gap-1.5 rounded-md border border-border/30 bg-background p-2',
        isDragging && 'opacity-60 shadow-md',
      )}
    >
      <button
        type="button"
        className="mt-1.5 cursor-grab text-muted-foreground/50 outline-none hover:text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="拖拽排序"
      >
        <DragDropVerticalIcon className="h-4 w-4" />
      </button>

      <ColorPicker color={item.color} onChange={(c) => onUpdate(item.id, { color: c })} />

      <div className="min-w-0 flex-1 space-y-1">
        <Input
          value={item.value}
          onChange={(e) => onUpdate(item.id, { value: e.target.value })}
          className={cn(
            'h-7 text-sm',
            duplicates.has(item.value) && item.value !== '' && 'border-destructive',
          )}
          placeholder={t('enumEditor.valuePlaceholder')}
        />
        <div className="grid grid-cols-2 gap-1">
          <Input
            value={item.zhComment}
            onChange={(e) => onUpdate(item.id, { zhComment: e.target.value })}
            className="h-6 text-xs"
            placeholder={t('enumEditor.zhComment')}
          />
          <Input
            value={item.enComment}
            onChange={(e) => onUpdate(item.id, { enComment: e.target.value })}
            className="h-6 text-xs"
            placeholder={t('enumEditor.enComment')}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="mt-1 text-muted-foreground/50 outline-none hover:text-destructive"
        aria-label={t('enumEditor.delete')}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
});
SortableItem.displayName = 'SortableItem';

export interface EnumSetEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldType: string;
  enumMeta: EnumValueMeta[] | undefined;
  onSave: (fieldType: string, enumMeta: EnumValueMeta[]) => void;
  mode?: 'native' | 'logical';
}

export const EnumSetEditor = memo<EnumSetEditorProps>(
  ({ open, onOpenChange, fieldType, enumMeta, onSave, mode = 'native' }) => {
    const { t } = useTranslation();
    const [items, setItems] = useState<EnumItem[]>([]);
    const [newValue, setNewValue] = useState('');
    const [addError, setAddError] = useState('');

    const isLogical = mode === 'logical';
    const baseType = isLogical
      ? fieldType
      : (fieldType.match(/^(enum|set)\s*/i)?.[1]?.toUpperCase() ?? 'ENUM');

    // Sync items when dialog opens
    useEffect(() => {
      if (open) {
        if (isLogical) {
          setItems(metaToItems(enumMeta?.map((m) => m.value) ?? [], enumMeta));
        } else {
          const parsed = parseEnumValues(fieldType);
          setItems(metaToItems(parsed, enumMeta));
        }
        setNewValue('');
        setAddError('');
      }
    }, [open, fieldType, enumMeta, isLogical]);

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = useCallback((event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setItems((prev) => {
        const oldIdx = prev.findIndex((i) => i.id === active.id);
        const newIdx = prev.findIndex((i) => i.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return prev;
        return arrayMove(prev, oldIdx, newIdx);
      });
    }, []);

    const handleUpdate = useCallback((id: string, patch: Partial<EnumItem>) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    }, []);

    const handleDelete = useCallback((id: string) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, []);

    const duplicates = new Set<string>(
      items.map((i) => i.value).filter((v, idx, arr) => v !== '' && arr.indexOf(v) !== idx),
    );

    const handleAdd = useCallback(() => {
      const trimmed = newValue.trim();
      if (!trimmed) {
        setAddError(t('enumEditor.emptyValue'));
        return;
      }
      if (items.some((i) => i.value === trimmed)) {
        setAddError(t('enumEditor.duplicateValue'));
        return;
      }
      const nextIdx = items.length;
      setItems((prev) => [
        ...prev,
        {
          id: `${trimmed}-${Date.now()}`,
          value: trimmed,
          color: ENUM_COLORS[nextIdx % ENUM_COLORS.length],
          zhComment: '',
          enComment: '',
        },
      ]);
      setNewValue('');
      setAddError('');
    }, [newValue, items, t]);

    const handleAddKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAdd();
        }
      },
      [handleAdd],
    );

    const handleConfirm = useCallback(() => {
      const values = items.map((i) => i.value).filter(Boolean);
      const hasDuplicates = new Set(values).size !== values.length;
      if (hasDuplicates) return;
      const newMeta = itemsToMeta(items.filter((i) => i.value));
      if (isLogical) {
        onSave(fieldType, newMeta);
      } else {
        const newFieldType = serializeEnumType(baseType, values);
        onSave(newFieldType, newMeta);
      }
      onOpenChange(false);
    }, [items, baseType, onSave, onOpenChange, isLogical, fieldType]);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[540px]">
          <DialogHeader>
            <DialogTitle>
              {t('enumEditor.title')} — <span className="font-mono text-primary">{baseType}</span>
            </DialogTitle>
            <DialogDescription>{t('enumEditor.subtitle')}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[380px] overflow-y-auto pr-1">
            {items.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t('enumEditor.noValues')}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={items.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">
                    {items.map((item) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        duplicates={duplicates}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="flex gap-2 border-t border-border/30 pt-3">
            <Input
              value={newValue}
              onChange={(e) => {
                setNewValue(e.target.value);
                setAddError('');
              }}
              onKeyDown={handleAddKeyDown}
              placeholder={t('enumEditor.addValuePlaceholder')}
              className={cn('h-8 flex-1 text-sm', addError && 'border-destructive')}
            />
            <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('enumEditor.addValue')}
            </Button>
          </div>
          {addError && <p className="-mt-1 text-xs text-destructive">{addError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('enumEditor.cancel')}
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={duplicates.size > 0}>
              {t('enumEditor.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);

EnumSetEditor.displayName = 'EnumSetEditor';
