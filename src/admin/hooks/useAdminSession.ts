import { useCallback, useEffect, useState } from 'react';
import { adminLogin, adminLogout, checkAdminSession } from '../lib/adminApi';

export const useAdminSession = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAdminSession()
      .then(setIsAuthenticated)
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (password: string) => {
    await adminLogin(password);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    await adminLogout();
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, isLoading, login, logout };
};
