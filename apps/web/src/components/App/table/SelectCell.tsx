import { memo, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface SelectCellProps {
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const SelectCell = memo<SelectCellProps>(
  ({ value, options, onChange, disabled = false, className, placeholder }) => {
    const normalizedOptions = options.map((option) =>
      typeof option === 'string'
        ? { value: option, label: option }
        : { value: option.value, label: option.label },
    );

    const selectedLabel =
      normalizedOptions.find((option) => option.value === value)?.label ?? value;

    const handleChange = useCallback(
      (newValue: string) => {
        if (newValue !== value) {
          onChange(newValue);
        }
      },
      [value, onChange],
    );

    // When disabled, show as plain text
    if (disabled) {
      return (
        <div
          className={cn(
            'flex h-7 w-full cursor-not-allowed items-center truncate whitespace-nowrap px-2 py-1 text-xs text-muted-foreground opacity-60',
            className,
          )}
          title={selectedLabel || placeholder}
        >
          {selectedLabel || placeholder || '\u00A0'}
        </div>
      );
    }

    return (
      <Select value={value} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger
          className={cn(
            'h-7 w-full border-0 bg-transparent px-2 text-xs shadow-none whitespace-nowrap hover:bg-muted/50 focus:ring-1 focus:ring-primary/30',
            className,
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="text-xs">
          {normalizedOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  },
);

SelectCell.displayName = 'SelectCell';
