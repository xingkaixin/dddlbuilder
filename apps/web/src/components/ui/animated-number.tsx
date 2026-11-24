import { lazy, Suspense } from 'react';
import type { Format } from '@number-flow/react';
import { cn } from '@/lib/utils';

const LazyNumberFlow = lazy(() =>
  import('@number-flow/react').then((mod) => ({ default: mod.default })),
);

interface AnimatedNumberProps {
  value: number;
  format?: Format;
  className?: string;
  locales?: Intl.LocalesArgument;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function AnimatedNumber({ value, format, className, locales }: AnimatedNumberProps) {
  const safeValue = Number.isFinite(value) ? value : 0;

  const formatted = (
    <span className={cn('tabular-nums', className)}>
      {new Intl.NumberFormat(locales, format).format(safeValue)}
    </span>
  );

  if (prefersReducedMotion()) {
    return formatted;
  }

  return (
    <Suspense fallback={formatted}>
      <LazyNumberFlow
        value={safeValue}
        format={format}
        locales={locales}
        className={cn('tabular-nums', className)}
      />
    </Suspense>
  );
}
