import type * as React from 'react';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'lm-field flex h-11 w-full rounded-lg border border-transparent bg-transparent px-4 py-2.5 font-text text-base transition-colors file:border-0 file:bg-transparent file:text-sm placeholder:font-ui placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
