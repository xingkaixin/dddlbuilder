import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SettingGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-1">
      <h2 id={`${id}-title`} className="relative pb-2 text-xl font-normal">
        {title}
        <span aria-hidden className="lm-rule" />
      </h2>
      {children}
    </section>
  );
}

export function SettingRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid min-h-14 items-center gap-x-6 gap-y-2 py-2 shadow-[inset_0_-1px_0_var(--line-faint)] sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      <div className="min-w-0">
        <div className="text-[15px]">{title}</div>
        {hint && <p className="font-text text-[13px] leading-5 text-muted-foreground">{hint}</p>}
      </div>
      {children && <div className="flex min-w-0 flex-col sm:items-end">{children}</div>}
    </div>
  );
}

const chipClass =
  'inline-flex min-h-[34px] items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(chipClass, active && 'lm-hatch text-foreground')}
    >
      {children}
    </button>
  );
}

export function ChoiceChips<Value extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  disabled?: boolean;
  onChange: (value: Value) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 sm:justify-end">
      {options.map((option) => (
        <Chip
          key={option.value}
          active={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}
