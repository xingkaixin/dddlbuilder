import type { ComponentProps } from 'react';
import { SavedTablesDrawer } from '../SavedTablesDrawer';

interface SavedTablesContainerProps {
  drawerProps: ComponentProps<typeof SavedTablesDrawer>;
}

export function SavedTablesContainer({
  drawerProps,
}: SavedTablesContainerProps) {
  return <SavedTablesDrawer {...drawerProps} />;
}
