import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Pencil } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { EnumValueMeta } from '@ddlbuilder/shared-types';
import { useTranslation } from 'react-i18next';
import { EnumSetEditor } from './EnumSetEditor';
import { ENUM_COLORS } from './EnumSetEditor';

interface LogicalEnumCellProps {
  fieldType: string;
  enumMeta: EnumValueMeta[] | undefined;
  onTypeChange: (value: string) => void;
  onEnumSave: (fieldType: string, enumMeta: EnumValueMeta[]) => void;
  onTabNavigate?: (direction: 1 | -1) => void;
}

const MAX_VISIBLE_CHIPS = 4;

export const LogicalEnumCell = memo<LogicalEnumCellProps>(
  ({ fieldType, enumMeta, onTypeChange, onEnumSave, onTabNavigate }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(fieldType);
    const inputRef = useRef<HTMLInputElement>(null);

    const chips = enumMeta && enumMeta.length > 0 ? enumMeta : [];
    const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
    const hiddenCount = chips.length - MAX_VISIBLE_CHIPS;

    useEffect(() => {
      if (!isEditing) setEditValue(fieldType);
    }, [fieldType, isEditing]);

    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isEditing]);

    const finishEditing = useCallback(
      (value: string) => {
        setIsEditing(false);
        if (value !== fieldType) {
          onTypeChange(value);
        }
      },
      [fieldType, onTypeChange],
    );

    const handleContainerKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (isEditing) return;

        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          setOpen(true);
          return;
        }

        if (e.key === 'Tab') {
          e.preventDefault();
          onTabNavigate?.(e.shiftKey ? -1 : 1);
          return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          setIsEditing(true);
          setEditValue('');
          return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setIsEditing(true);
          setEditValue(e.key);
        }
      },
      [isEditing, onTabNavigate],
    );

    const handleInputKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          finishEditing(editValue);
          setTimeout(() => onTabNavigate?.(e.shiftKey ? -1 : 1), 0);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          finishEditing(editValue);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsEditing(false);
          setEditValue(fieldType);
        }
      },
      [editValue, fieldType, finishEditing, onTabNavigate],
    );

    const handleDoubleClick = useCallback(() => {
      setIsEditing(true);
      setEditValue(fieldType);
    }, [fieldType]);

    if (isEditing) {
      return (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => finishEditing(editValue)}
          onKeyDown={handleInputKeyDown}
          className="h-7 w-full border-primary/50 bg-background px-2 py-1 text-xs focus:ring-1 focus:ring-primary/30"
          placeholder={t('dataTable.placeholder.fieldType')}
        />
      );
    }

    return (
      <>
        <div
          tabIndex={0}
          role="button"
          aria-label={t('enumEditor.editTip')}
          onKeyDown={handleContainerKeyDown}
          onDoubleClick={handleDoubleClick}
          className={cn(
            'group flex h-7 w-full cursor-pointer items-center gap-1 truncate px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30',
          )}
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-mono text-xs',
              !fieldType && 'text-muted-foreground/50',
            )}
            title={fieldType || undefined}
          >
            {fieldType || t('dataTable.placeholder.fieldType')}
          </span>

          {visibleChips.map((chip, idx) => (
            <span
              key={`${chip.value}-${idx}`}
              className="shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium text-white"
              style={{
                backgroundColor: chip.color ?? ENUM_COLORS[idx % ENUM_COLORS.length],
              }}
              title={chip.value}
            >
              {chip.value}
            </span>
          ))}

          {hiddenCount > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground">+{hiddenCount}</span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            className="ml-auto shrink-0 opacity-0 transition-opacity group-focus:opacity-100 group-hover:opacity-100 outline-none hover:text-primary"
            aria-label={t('enumEditor.editTip')}
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        <EnumSetEditor
          open={open}
          onOpenChange={setOpen}
          fieldType={fieldType}
          enumMeta={enumMeta}
          onSave={onEnumSave}
          mode="logical"
        />
      </>
    );
  },
);

LogicalEnumCell.displayName = 'LogicalEnumCell';
