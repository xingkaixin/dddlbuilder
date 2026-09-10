import { ApiError } from '@/services/apiError';
import {
  decodeAdminActionResponse,
  decodeAdminSessionResponse,
  decodeAdminUsersResponse,
  decodeAdminUserResponse,
  decodeAdminEmailVerificationResponse,
  decodeAdminCreditGrantResponse,
  decodeAdminLedgerResponse,
  decodeAdminUsageResponse,
} from '@ddlbuilder/shared-types/api';
import { decodeApiError } from '@ddlbuilder/shared-types/api-contracts';
import * as Option from 'effect/Option';

export type {
  AdminUserSummary,
  AdminUserDetail,
  CreditLedgerItem,
  AdminUsageEvent as UsageEventItem,
} from '@ddlbuilder/shared-types/api';

import type {
  AdminUserSummary,
  AdminUserDetail,
  CreditLedgerItem,
  AdminUsageEvent as UsageEventItem,
} from '@ddlbuilder/shared-types/api';

type Decoder<T> = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- decoders are the shared API boundary for untrusted JSON.
  value: unknown,
) => Option.Option<T>;

const adminFetch = async <T>(
  path: string,
  decode: Decoder<T>,
  options?: RequestInit,
): Promise<T> => {
  const res = await fetch(`/api/admin${path}`, { credentials: 'include', ...options });
  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const error = decodeApiError(json);
    throw new ApiError(error.error ?? `Request failed: ${res.status}`, res.status, error.code);
  }

  const decoded = decode(json);

  if (Option.isNone(decoded)) throw new Error('Invalid admin response');

  return decoded.value;
};

export const adminLogin = async (password: string): Promise<void> => {
  const res = await fetch('/api/admin/session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) throw new Error('INVALID_PASSWORD');

  if (Option.isNone(decodeAdminActionResponse(await res.json().catch(() => null))))
    throw new Error('Invalid admin response');
};

export const adminLogout = async (): Promise<void> => {
  await adminFetch('/session', decodeAdminActionResponse, { method: 'DELETE' });
};

export const checkAdminSession = async (): Promise<boolean> => {
  try {
    return (await adminFetch('/session', decodeAdminSessionResponse)).authenticated;
  } catch {
    return false;
  }
};

export const listUsers = async (limit = 50, offset = 0): Promise<AdminUserSummary[]> => {
  const result = await adminFetch(
    `/users?limit=${limit}&offset=${offset}`,
    decodeAdminUsersResponse,
  );

  return result.users;
};

export const getUserDetail = async (userId: string): Promise<AdminUserDetail> => {
  const result = await adminFetch(`/users/${userId}`, decodeAdminUserResponse);

  return result.user;
};

export const resetUserPassword = async (userId: string): Promise<void> => {
  await adminFetch(`/users/${userId}/reset-password`, decodeAdminActionResponse, {
    method: 'POST',
  });
};

export const disableUser = async (userId: string, reason?: string): Promise<void> => {
  await adminFetch(`/users/${userId}/disable`, decodeAdminActionResponse, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
};

export const enableUser = async (userId: string): Promise<void> => {
  await adminFetch(`/users/${userId}/enable`, decodeAdminActionResponse, { method: 'POST' });
};

export const updateUserEmailVerification = async (
  userId: string,
  verified: boolean,
): Promise<boolean> => {
  const result = await adminFetch(
    `/users/${userId}/email-verification`,
    decodeAdminEmailVerificationResponse,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verified }),
    },
  );

  return result.emailVerified;
};

export const grantUserCredits = async (
  userId: string,
  amount: number,
  note?: string,
): Promise<number> => {
  const result = await adminFetch(`/users/${userId}/credits`, decodeAdminCreditGrantResponse, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ amount, note }),
  });

  return result.newBalance;
};

export const getUserCreditLedger = async (
  userId: string,
  limit = 20,
): Promise<CreditLedgerItem[]> => {
  const result = await adminFetch(
    `/users/${userId}/credits/ledger?limit=${limit}`,
    decodeAdminLedgerResponse,
  );

  return result.items;
};

export const getUserUsageEvents = async (
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ items: UsageEventItem[]; total: number }> => {
  return adminFetch(
    `/users/${userId}/usage-events?limit=${limit}&offset=${offset}`,
    decodeAdminUsageResponse,
  );
};
