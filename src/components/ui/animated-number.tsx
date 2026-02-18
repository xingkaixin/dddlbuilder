import NumberFlow, { usePrefersReducedMotion } from '@number-flow/react';
import { cn } from '@/lib/utils';

interface AnimatedNumberProps {
  value: number;
  format?: Intl.NumberFormatOptions;
  className?: string;
  locales?: Intl.LocalesArgument;
}

export function AnimatedNumber({
  value,
  format,
  className,
  locales,
}: AnimatedNumberProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const safeValue = Number.isFinite(value) ? value : 0;

  if (prefersReducedMotion) {
    return (
      <span className={cn('tabular-nums', className)}>
        {new Intl.NumberFormat(locales, format).format(safeValue)}
      </span>
    );
  }

  return (
    <NumberFlow
      value={safeValue}
      format={format}
      locales={locales}
      className={cn('tabular-nums', className)}
    />
  );
}
