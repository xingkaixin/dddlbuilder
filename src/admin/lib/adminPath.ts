export const isAdminPath = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/admin');
};
