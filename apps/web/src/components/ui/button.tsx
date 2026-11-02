import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { Ink } from '@/components/ui/sketch';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  't-ui-button lm-sketch inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 ring-offset-background',
  {
    variants: {
      variant: {
        default:
          'text-foreground [--lm-wash-op:var(--wash-rest)] hover:[--lm-wash-op:var(--wash-hover)]',
        destructive:
          'text-destructive [--lm-stroke:var(--danger)] [--lm-wash-op:var(--wash-rest)] [--lm-wash:var(--danger-wash)] hover:[--lm-wash-op:var(--wash-hover)]',
        outline: 'text-foreground [--lm-wash:var(--line)] hover:[--lm-wash-op:var(--wash-ghost)]',
        secondary:
          'text-secondary-foreground [--lm-stroke:var(--line)] [--lm-wash:var(--line)] hover:[--lm-wash-op:var(--wash-ghost)]',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-5 py-2.5',
        sm: 'h-9 rounded-md px-4 text-sm',
        lg: 'h-11 rounded-lg px-8 text-base',
        icon: 'h-10 w-10',
        tool: 'h-8 gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

function Button({ className, variant = 'default', size, children, ...props }: ButtonProps) {
  const drawn = variant !== 'ghost' && variant !== 'link';

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {drawn && <Ink wash />}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
