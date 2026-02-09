import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface EditableCellProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const EditableCell = memo<EditableCellProps>(
  ({ value, onChange, disabled = false, className, placeholder }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync with external value when not editing
    useEffect(() => {
      if (!isEditing) {
        setEditValue(value);
      }
    }, [value, isEditing]);

    const handleDoubleClick = useCallback(() => {
      if (disabled) return;
      setIsEditing(true);
      setEditValue(value);
    }, [disabled, value]);

    const handleBlur = useCallback(() => {
      setIsEditing(false);
      if (editValue !== value) {
        onChange(editValue);
      }
    }, [editValue, value, onChange]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          inputRef.current?.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setEditValue(value);
          setIsEditing(false);
        }
      },
      [value],
    );

    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
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
        onDoubleClick={handleDoubleClick}
        className={cn(
          'flex h-8 w-full cursor-text items-center truncate px-2 py-1',
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
