import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface EditableCellProps {
  value: string;
  onChange: (value: string) => void;
  onTabNavigate?: (direction: 1 | -1) => void;
  isEditing?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
  onEditingEnd?: () => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const EditableCell = memo<EditableCellProps>(
  ({
    value,
    onChange,
    onTabNavigate,
    isEditing: controlledIsEditing,
    onEditingChange,
    onEditingEnd,
    disabled = false,
    className,
    placeholder,
  }) => {
    const [uncontrolledIsEditing, setUncontrolledIsEditing] = useState(false);
    const isEditing = controlledIsEditing ?? uncontrolledIsEditing;
    const [editValue, setEditValue] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);
    const cellRef = useRef<HTMLDivElement>(null);
    const pendingTabDirectionRef = useRef<1 | -1 | null>(null);
    const triggerSourceRef = useRef<'doubleClick' | 'keyboard' | 'replace' | 'focus' | null>(null);
    const initialEditValueRef = useRef(value);
    const lastCommittedValueRef = useRef(value);

    const setEditing = useCallback(
      (nextIsEditing: boolean) => {
        if (controlledIsEditing === undefined) {
          setUncontrolledIsEditing(nextIsEditing);
        }
        onEditingChange?.(nextIsEditing);
      },
      [controlledIsEditing, onEditingChange],
    );

    const commitValue = useCallback(
      (nextValue: string) => {
        if (nextValue === lastCommittedValueRef.current) return;
        lastCommittedValueRef.current = nextValue;
        onChange(nextValue);
      },
      [onChange],
    );

    const startEditingWithCurrentValue = useCallback(
      (source: 'doubleClick' | 'keyboard' | 'focus') => {
        if (disabled) return;
        initialEditValueRef.current = value;
        lastCommittedValueRef.current = value;
        triggerSourceRef.current = source;
        setEditing(true);
        setEditValue(value);
      },
      [disabled, setEditing, value],
    );

    const handleDoubleClick = useCallback(() => {
      startEditingWithCurrentValue('doubleClick');
    }, [startEditingWithCurrentValue]);

    const handleFocus = useCallback(() => {
      startEditingWithCurrentValue('focus');
    }, [startEditingWithCurrentValue]);

    // Start editing with empty value (type-to-replace behavior)
    const startEditingWithReplace = useCallback(
      (initialChar: string) => {
        if (disabled) return;
        initialEditValueRef.current = value;
        lastCommittedValueRef.current = value;
        triggerSourceRef.current = 'replace';
        setEditing(true);
        setEditValue(initialChar);
      },
      [disabled, setEditing, value],
    );

    const finishEditing = useCallback(
      (nextValue: string) => {
        commitValue(nextValue);
        setEditing(false);
        onEditingEnd?.();
      },
      [commitValue, onEditingEnd, setEditing],
    );

    const handleBlur = useCallback(() => {
      finishEditing(inputRef.current?.value ?? editValue);
      const direction = pendingTabDirectionRef.current;
      pendingTabDirectionRef.current = null;
      if (direction) {
        setTimeout(() => {
          onTabNavigate?.(direction);
        }, 0);
      }
    }, [editValue, finishEditing, onTabNavigate]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setEditValue(e.target.value);
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          pendingTabDirectionRef.current = e.shiftKey ? -1 : 1;
          const currentValue = inputRef.current?.value ?? editValue;
          setEditValue(currentValue);
          finishEditing(currentValue);
          inputRef.current?.blur();
          return;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          pendingTabDirectionRef.current = null;
          const currentValue = inputRef.current?.value ?? editValue;
          setEditValue(currentValue);
          finishEditing(currentValue);
          inputRef.current?.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          pendingTabDirectionRef.current = null;
          const initialValue = initialEditValueRef.current;
          setEditValue(initialValue);
          finishEditing(initialValue);
        }
      },
      [editValue, finishEditing],
    );

    // Handle keyboard input when cell is focused (not editing)
    const handleCellKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (disabled) return;

        // Enter or F2 to start editing with current value
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          startEditingWithCurrentValue('keyboard');
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
      [disabled, startEditingWithCurrentValue, startEditingWithReplace],
    );

    // Focus input when editing starts
    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        const shouldSelectAll =
          triggerSourceRef.current === 'keyboard' || triggerSourceRef.current === 'focus';
        if (shouldSelectAll) {
          inputRef.current.select();
        } else {
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
        triggerSourceRef.current = null;
      }
    }, [isEditing]);

    if (isEditing) {
      return (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-7 w-full border-transparent bg-transparent px-2 py-1 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
            className,
          )}
          autoComplete="off"
          data-1p-ignore="true"
          data-op-ignore="true"
          placeholder={placeholder}
          title={editValue || placeholder}
        />
      );
    }

    return (
      <div
        ref={cellRef}
        tabIndex={disabled ? -1 : 0}
        data-editable-cell-trigger="true"
        onFocus={handleFocus}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleCellKeyDown}
        className={cn(
          'flex h-7 w-full cursor-text items-center truncate px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30',
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
