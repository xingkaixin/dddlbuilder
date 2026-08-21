import { queryOptions } from '@tanstack/react-query';
import {
  getUserCreditLedger,
  getUserDetail,
  getUserUsageEvents,
  listUsers,
} from '@/admin/lib/adminApi';

const ADMIN_STALE_TIME_MS = 15_000;

export const adminQueryKeys = {
  all: ['admin'] as const,
  usersRoot: ['admin', 'users'] as const,
  users: (limit: number, offset: number) => ['admin', 'users', { limit, offset }] as const,
  user: (userId: string) => ['admin', 'users', userId] as const,
  ledger: (userId: string, limit: number) =>
    ['admin', 'users', userId, 'credits', { limit }] as const,
  usage: (userId: string, limit: number, offset: number) =>
    ['admin', 'users', userId, 'usage', { limit, offset }] as const,
};

export function adminUsersOptions(limit: number, offset: number) {
  return queryOptions({
    queryKey: adminQueryKeys.users(limit, offset),
    queryFn: () => listUsers(limit, offset),
    staleTime: ADMIN_STALE_TIME_MS,
  });
}

export function adminUserOptions(userId: string) {
  return queryOptions({
    queryKey: adminQueryKeys.user(userId),
    queryFn: () => getUserDetail(userId),
    staleTime: ADMIN_STALE_TIME_MS,
  });
}

export function adminLedgerOptions(userId: string, limit: number) {
  return queryOptions({
    queryKey: adminQueryKeys.ledger(userId, limit),
    queryFn: () => getUserCreditLedger(userId, limit),
    staleTime: ADMIN_STALE_TIME_MS,
  });
}

export function adminUsageOptions(userId: string, limit: number, offset: number) {
  return queryOptions({
    queryKey: adminQueryKeys.usage(userId, limit, offset),
    queryFn: () => getUserUsageEvents(userId, limit, offset),
    staleTime: ADMIN_STALE_TIME_MS,
  });
}
