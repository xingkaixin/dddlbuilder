import { memo, useCallback } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface CheckboxCellProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const CheckboxCell = memo<CheckboxCellProps>(
  ({ checked, onChange, disabled = false, className }) => {
    const handleChange = useCallback(
      (value: boolean | 'indeterminate') => {
        if (value !== 'indeterminate') {
          onChange(value);
        }
      },
      [onChange],
    );

    return (
      <div
        className={cn(
          'flex h-8 w-full items-center justify-center',
          disabled && 'opacity-60',
          className,
        )}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={handleChange}
          disabled={disabled}
          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
        />
      </div>
    );
  },
);

CheckboxCell.displayName = 'CheckboxCell';
