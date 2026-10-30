import { memo, useCallback, useReducer, useRef } from 'react';
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

type TriggerSource = 'doubleClick' | 'keyboard' | 'replace' | 'focus';

type CellState = {
  uncontrolledIsEditing: boolean;
  editValue: string;
  initialValue: string;
};

type CellEvent =
  | { type: 'editStarted'; initialValue: string; editValue: string }
  | { type: 'editValueChanged'; editValue: string }
  | { type: 'editFinished'; editValue: string }
  | { type: 'valueSynced'; value: string };

function cellReducer(state: CellState, event: CellEvent): CellState {
  switch (event.type) {
    case 'editStarted':
      return {
        uncontrolledIsEditing: true,
        editValue: event.editValue,
        initialValue: event.initialValue,
      };
    case 'editValueChanged':
      return { ...state, editValue: event.editValue };
    case 'editFinished':
      return { ...state, uncontrolledIsEditing: false, editValue: event.editValue };
    case 'valueSynced':
      return { ...state, editValue: event.value, initialValue: event.value };
  }
}

const createCellState = (value: string): CellState => ({
  uncontrolledIsEditing: false,
  editValue: value,
  initialValue: value,
});

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
    const [{ uncontrolledIsEditing, editValue, initialValue }, dispatch] = useReducer(
      cellReducer,
      value,
      createCellState,
    );
    const isEditing = controlledIsEditing ?? uncontrolledIsEditing;
    const inputRef = useRef<HTMLInputElement | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);
    const pendingTabDirectionRef = useRef<1 | -1 | null>(null);
    const triggerSourceRef = useRef<TriggerSource | null>(null);
    // Enter commits and then blurs; the blur handler commits again and must not repeat onChange.
    const lastCommittedValueRef = useRef<string | null>(null);

    if (!isEditing && (editValue !== value || initialValue !== value)) {
      dispatch({ type: 'valueSynced', value });
    }

    const commitValue = useCallback(
      (nextValue: string) => {
        if (nextValue === (lastCommittedValueRef.current ?? initialValue)) return;
        lastCommittedValueRef.current = nextValue;
        onChange(nextValue);
      },
      [initialValue, onChange],
    );

    // Stable so it only runs when the input mounts. StrictMode attaches refs twice, so it reads the
    // trigger source without clearing it; finishEditing clears it instead.
    const attachInput = useCallback((input: HTMLInputElement | null) => {
      inputRef.current = input;

      if (!input) return;

      lastCommittedValueRef.current = null;
      input.focus();

      const source = triggerSourceRef.current;

      if (source === 'keyboard' || source === 'focus') {
        input.select();

        return;
      }

      input.setSelectionRange(input.value.length, input.value.length);
    }, []);

    const startEditingWithCurrentValue = useCallback(
      (source: 'doubleClick' | 'keyboard' | 'focus') => {
        if (disabled) return;
        triggerSourceRef.current = source;
        dispatch({ type: 'editStarted', initialValue: value, editValue: value });
        onEditingChange?.(true);
      },
      [disabled, onEditingChange, value],
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
        triggerSourceRef.current = 'replace';
        dispatch({ type: 'editStarted', initialValue: value, editValue: initialChar });
        onEditingChange?.(true);
      },
      [disabled, onEditingChange, value],
    );

    const finishEditing = useCallback(
      (nextValue: string) => {
        commitValue(nextValue);
        triggerSourceRef.current = null;
        dispatch({ type: 'editFinished', editValue: nextValue });
        onEditingChange?.(false);
        onEditingEnd?.();
      },
      [commitValue, onEditingChange, onEditingEnd],
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
      dispatch({ type: 'editValueChanged', editValue: e.target.value });
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          pendingTabDirectionRef.current = e.shiftKey ? -1 : 1;
          finishEditing(inputRef.current?.value ?? editValue);
          inputRef.current?.blur();

          return;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          pendingTabDirectionRef.current = null;
          finishEditing(inputRef.current?.value ?? editValue);
          inputRef.current?.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          pendingTabDirectionRef.current = null;
          finishEditing(initialValue);
        }
      },
      [editValue, finishEditing, initialValue],
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

    if (isEditing) {
      return (
        <Input
          ref={attachInput}
          value={editValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-7 w-full border-transparent bg-transparent px-2 py-1 text-xs any-pointer-coarse:text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
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
