const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

window.addEventListener('popstate', notify);

export const getPathname = () => window.location.pathname;

export function subscribePathname(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function pushPathname(pathname: string) {
  if (pathname === getPathname()) return;
  window.history.pushState({}, '', pathname);
  notify();
}

export function replacePathname(pathname: string) {
  window.history.replaceState({}, '', pathname);
  notify();
}
