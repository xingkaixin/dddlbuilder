import { useSyncExternalStore } from 'react';
import { getPathname, subscribePathname } from '@/lib/pathnameStore';

export type AppRoute =
  | { view: 'tables' }
  | { view: 'er' }
  | { view: 'tools'; toolId: string | null }
  | { view: 'settings' };

export function parseAppRoute(pathname: string): AppRoute {
  const [, first, second] = pathname.split('/');

  if (first === 'er') return { view: 'er' };

  if (first === 'tools') return { view: 'tools', toolId: second || null };

  if (first === 'settings') return { view: 'settings' };

  return { view: 'tables' };
}

export const useAppRoute = () =>
  parseAppRoute(useSyncExternalStore(subscribePathname, getPathname));
