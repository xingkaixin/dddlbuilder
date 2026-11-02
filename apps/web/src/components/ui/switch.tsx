import type * as React from 'react';
import { forwardRef } from 'react';

import { Ink } from '@/components/ui/sketch';
import { cn } from '@/lib/utils';

export interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, ...props }, ref) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        ref={ref}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          'lm-sketch peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          checked && '[--lm-wash-op:var(--wash-hover)]',
          className,
        )}
        {...props}
      >
        <Ink wash radius={12} />
        <span
          className={cn(
            'lm-sketch pointer-events-none block h-5 w-5 rounded-full bg-card transition-transform',
            checked ? 'translate-x-5 rotate-[25deg]' : 'translate-x-0',
          )}
        >
          <Ink radius={10} />
        </span>
      </button>
    );
  },
);
Switch.displayName = 'Switch';

export { Switch };
