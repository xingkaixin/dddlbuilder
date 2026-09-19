import type { ReactNode } from 'react';

export function ToolLayout({
  title,
  description,
  source,
  children,
}: {
  title: string;
  description: string;
  source?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="schema-tool-layout min-w-0">
      <header className="mb-6 space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </header>
      <div className={source ? 'schema-tool-body grid items-start gap-6' : 'min-w-0 space-y-5'}>
        {source && (
          <div className="min-w-0 space-y-5 rounded-xl border bg-muted/30 p-4">{source}</div>
        )}
        {source ? <div className="min-w-0 space-y-5">{children}</div> : children}
      </div>
    </div>
  );
}
