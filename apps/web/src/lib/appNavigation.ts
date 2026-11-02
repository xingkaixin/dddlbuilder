import type { MouseEvent } from 'react';
import { getPathname, pushPathname } from './pathnameStore';

export function navigateApp(pathname: string) {
  // Workspace writes stay gated by the share route, so leaving it needs a fresh load.
  if (getPathname().startsWith('/share/')) window.location.assign(pathname);
  else pushPathname(pathname);
}

export function followAppLink(event: MouseEvent<HTMLElement>, pathname: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateApp(pathname);
}
