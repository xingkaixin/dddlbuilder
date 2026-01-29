import { memo } from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton = memo<SkeletonProps>(({ className = '' }) => (
  <div className={`animate-pulse rounded bg-muted ${className}`} />
));

export const SkeletonText = memo<SkeletonProps>(({ className = '' }) => (
  <div className={`skeleton h-4 w-full rounded ${className}`} />
));

export const SkeletonCard = memo<{ lines?: number }>(({ lines = 3 }) => (
  <div className="space-y-3 rounded-lg border p-4">
    <div className="flex items-center gap-2">
      <Skeleton className="h-5 w-5 rounded" />
      <SkeletonText className="w-1/3" />
    </div>
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonText key={i} className={`w-${['full', '3/4', '1/2'][i % 3]}`} />
    ))}
  </div>
));

export const SkeletonTable = memo<{ rows?: number; cols?: number }>(
  ({ rows = 5, cols = 4 }) => (
    <div className="w-full space-y-2">
      {/* Header */}
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-6 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`r-${rowIndex}`} className="flex gap-2 py-2">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton
              key={`c-${rowIndex}-${colIndex}`}
              className="h-8 flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  ),
);

export const SkeletonForm = memo<{ fields?: number }>(({ fields = 3 }) => (
  <div className="space-y-4">
    {Array.from({ length: fields }).map((_, i) => (
      <div key={i} className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-full" />
      </div>
    ))}
  </div>
));

export const SkeletonHeader = memo(() => (
  <div className="flex items-center justify-between border-b px-4 py-3">
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-8 rounded" />
      <Skeleton className="h-5 w-24" />
    </div>
    <div className="flex gap-1">
      <Skeleton className="h-8 w-8 rounded" />
      <Skeleton className="h-8 w-8 rounded" />
      <Skeleton className="h-8 w-8 rounded" />
    </div>
  </div>
));

export const SkeletonCode = memo<{ lines?: number }>(({ lines = 8 }) => (
  <div className="space-y-1.5">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className="h-4 w-6" />
        <div className="flex-1">
          <div
            className="skeleton h-4 rounded"
            style={{ width: `${Math.random() * 40 + 60}%` }}
          />
        </div>
      </div>
    ))}
  </div>
));
