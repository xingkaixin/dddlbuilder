import type { ReactNode } from 'react';

interface DialogRenderGuardProps {
  open: boolean;
  children: ReactNode;
}

export function DialogRenderGuard({ open, children }: DialogRenderGuardProps) {
  return open ? children : null;
}
