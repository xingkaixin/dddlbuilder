import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminQueryKeys, adminSessionOptions } from '@/queries/admin';
import { adminLogin, adminLogout } from '../lib/adminApi';

export const useAdminSession = () => {
  const queryClient = useQueryClient();
  const session = useQuery(adminSessionOptions());

  const setAuthenticated = (authenticated: boolean) =>
    queryClient.setQueryData(adminQueryKeys.session, authenticated);
  const login = useMutation({
    mutationFn: adminLogin,
    onSuccess: () => setAuthenticated(true),
  });
  const logout = useMutation({
    mutationFn: adminLogout,
    onSuccess: () => setAuthenticated(false),
  });

  return {
    isAuthenticated: session.data ?? false,
    isLoading: session.isPending,
    login: login.mutateAsync,
    logout: logout.mutateAsync,
  };
};
