import { memo } from 'react';
import { cn } from '@/lib/utils';

interface OrderCellProps {
  order: number;
  warnings: string[];
  className?: string;
}

export const OrderCell = memo<OrderCellProps>(
  ({ order, warnings, className }) => {
    const hasWarnings = warnings.length > 0;
    const tooltipText = warnings.join('，');

    return (
      <div
        className={cn(
          'flex h-8 w-full items-center justify-center gap-1',
          className,
        )}
      >
        <span className="text-sm text-muted-foreground">{order}</span>
        {hasWarnings && (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-600 dark:text-amber-400"
            title={tooltipText}
          >
            !
          </span>
        )}
      </div>
    );
  },
);

OrderCell.displayName = 'OrderCell';
