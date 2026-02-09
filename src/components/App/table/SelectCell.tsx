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
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const SelectCell = memo<SelectCellProps>(
  ({ value, options, onChange, disabled = false, className, placeholder }) => {
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
            'flex h-8 w-full cursor-not-allowed items-center truncate whitespace-nowrap px-2 py-1 text-sm text-muted-foreground opacity-60',
            className,
          )}
          title={value || placeholder}
        >
          {value || placeholder || '\u00A0'}
        </div>
      );
    }

    return (
      <Select value={value} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger
          className={cn(
            'h-8 w-full border-0 bg-transparent text-sm shadow-none whitespace-nowrap hover:bg-muted/50 focus:ring-1 focus:ring-primary/30',
            className,
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  },
);

SelectCell.displayName = 'SelectCell';
