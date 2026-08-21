import { memo, type ReactNode } from 'react';

interface DialogRenderGuardProps {
  open: boolean;
  children: ReactNode;
}

function DialogRenderGuardComponent({ children }: DialogRenderGuardProps) {
  return children;
}

const skipRepeatedClosedRenders = (
  previous: DialogRenderGuardProps,
  next: DialogRenderGuardProps,
) => !previous.open && !next.open;

export const DialogRenderGuard = memo(DialogRenderGuardComponent, skipRepeatedClosedRenders);
