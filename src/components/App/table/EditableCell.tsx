import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface EditableCellProps {
  value: string;
  onChange: (value: string) => void;
  onTabNavigate?: (direction: 1 | -1) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const EditableCell = memo<EditableCellProps>(
  ({
    value,
    onChange,
    onTabNavigate,
    disabled = false,
    className,
    placeholder,
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);
    const cellRef = useRef<HTMLDivElement>(null);
    const pendingTabDirectionRef = useRef<1 | -1 | null>(null);
    const triggerSourceRef = useRef<'doubleClick' | 'keyboard' | null>(null);

    // Sync with external value when not editing
    useEffect(() => {
      if (!isEditing) {
        setEditValue(value);
      }
    }, [value, isEditing]);

    // Start editing with current value (double-click behavior)
    const handleDoubleClick = useCallback(() => {
      if (disabled) return;
      triggerSourceRef.current = 'doubleClick';
      setIsEditing(true);
      setEditValue(value);
    }, [disabled, value]);

    // Start editing with empty value (type-to-replace behavior)
    const startEditingWithReplace = useCallback(
      (initialChar: string) => {
        if (disabled) return;
        setIsEditing(true);
        setEditValue(initialChar);
      },
      [disabled],
    );

    const handleBlur = useCallback(() => {
      setIsEditing(false);
      if (editValue !== value) {
        onChange(editValue);
      }
      const direction = pendingTabDirectionRef.current;
      pendingTabDirectionRef.current = null;
      if (direction) {
        setTimeout(() => {
          onTabNavigate?.(direction);
        }, 0);
      }
    }, [editValue, value, onChange, onTabNavigate]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          pendingTabDirectionRef.current = e.shiftKey ? -1 : 1;
          inputRef.current?.blur();
          return;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          pendingTabDirectionRef.current = null;
          inputRef.current?.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          pendingTabDirectionRef.current = null;
          setEditValue(value);
          setIsEditing(false);
        }
      },
      [value],
    );

    // Handle keyboard input when cell is focused (not editing)
    const handleCellKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (disabled) return;

        // Enter or F2 to start editing with current value
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          triggerSourceRef.current = 'keyboard';
          setIsEditing(true);
          setEditValue(value);
          return;
        }

        // Delete/Backspace to clear and start editing
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          startEditingWithReplace('');
          return;
        }

        // Printable character - start editing with this character
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          startEditingWithReplace(e.key);
        }
      },
      [disabled, value, startEditingWithReplace],
    );

    // Focus input when editing starts
    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        const isDoubleClick = triggerSourceRef.current === 'doubleClick';
        if (isDoubleClick) {
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        } else {
          inputRef.current.select();
        }
        triggerSourceRef.current = null;
      }
    }, [isEditing]);

    if (isEditing) {
      return (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-8 w-full border-primary/50 bg-background focus:ring-1 focus:ring-primary/30',
            className,
          )}
          placeholder={placeholder}
        />
      );
    }

    return (
      <div
        ref={cellRef}
        tabIndex={disabled ? -1 : 0}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleCellKeyDown}
        className={cn(
          'flex h-8 w-full cursor-text items-center truncate px-2 py-1 outline-none focus:ring-1 focus:ring-primary/30',
          disabled && 'cursor-not-allowed text-muted-foreground opacity-60',
          !value && 'text-muted-foreground/50',
          className,
        )}
        title={value || placeholder}
      >
        {value || placeholder || '\u00A0'}
      </div>
    );
  },
);

EditableCell.displayName = 'EditableCell';
