import type { ReactNode } from 'react';
import { Ink } from '@/components/ui/sketch';
import { cn } from '@/lib/utils';

interface NoticeProps {
  tone?: 'note' | 'warning';
  className?: string;
  children: ReactNode;
}

export function Notice({ tone = 'note', className, children }: NoticeProps) {
  return (
    <div
      className={cn(
        'lm-sketch rounded-md px-3 py-2 text-sm leading-6 text-foreground',
        tone === 'note' ? '[--lm-stroke:var(--line)]' : 'lm-tone--warning',
        className,
      )}
    >
      <Ink radius={6} />
      {children}
    </div>
  );
}
