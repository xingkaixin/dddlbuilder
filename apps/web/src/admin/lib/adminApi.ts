export type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  balance: number;
  createdAt: string;
  disabled: boolean;
};

export type AdminUserDetail = AdminUserSummary & {
  updatedAt: string;
  lastActiveAt: string | null;
};

export type CreditLedgerItem = {
  id: string;
  userId: string;
  kind: 'grant' | 'consume' | 'refund';
  source: string;
  amount: number;
  balanceAfter: number;
  idempotencyKey: string;
  metadataJson: string | null;
  createdAt: string;
};

export type UsageEventItem = {
  id: string;
  routeKey: string;
  requestId: string;
  estimatedTokens: number;
  actualTotalTokens: number | null;
  status: string;
  errorCode: string | null;
  createdAt: string;
};

type ApiErrorResponse = {
  error?: string;
};

const adminFetch = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'include',
    ...options,
  });
  const json = (await res.json()) as ApiErrorResponse & T;
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed: ${res.status}`);
  }
  return json as T;
};

export const adminLogin = async (password: string): Promise<void> => {
  const res = await fetch('/api/admin/session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    throw new Error('INVALID_PASSWORD');
  }
};

export const adminLogout = async (): Promise<void> => {
  await fetch('/api/admin/session', {
    method: 'DELETE',
    credentials: 'include',
  });
};

export const checkAdminSession = async (): Promise<boolean> => {
  try {
    const res = await fetch('/api/admin/session', { credentials: 'include' });
    const json = (await res.json()) as { authenticated: boolean };
    return json.authenticated;
  } catch {
    return false;
  }
};

export const listUsers = async (limit = 50, offset = 0): Promise<AdminUserSummary[]> => {
  const result = await adminFetch<{ users: AdminUserSummary[] }>(
    `/users?limit=${limit}&offset=${offset}`,
  );
  return result.users;
};

export const getUserDetail = async (userId: string): Promise<AdminUserDetail> => {
  const result = await adminFetch<{ user: AdminUserDetail }>(`/users/${userId}`);
  return result.user;
};

export const resetUserPassword = async (userId: string): Promise<void> => {
  await adminFetch(`/users/${userId}/reset-password`, { method: 'POST' });
};

export const disableUser = async (userId: string, reason?: string): Promise<void> => {
  await adminFetch(`/users/${userId}/disable`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
};

export const enableUser = async (userId: string): Promise<void> => {
  await adminFetch(`/users/${userId}/enable`, { method: 'POST' });
};

export const updateUserEmailVerification = async (
  userId: string,
  verified: boolean,
): Promise<boolean> => {
  const result = await adminFetch<{ emailVerified: boolean }>(`/users/${userId}/email-verification`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verified }),
  });
  return result.emailVerified;
};

export const grantUserCredits = async (
  userId: string,
  amount: number,
  note?: string,
): Promise<number> => {
  const result = await adminFetch<{ newBalance: number }>(`/users/${userId}/credits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount, note }),
  });
  return result.newBalance;
};

export const getUserCreditLedger = async (
  userId: string,
  limit = 20,
): Promise<CreditLedgerItem[]> => {
  const result = await adminFetch<{ items: CreditLedgerItem[] }>(
    `/users/${userId}/credits/ledger?limit=${limit}`,
  );
  return result.items;
};

export const getUserUsageEvents = async (
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ items: UsageEventItem[]; total: number }> => {
  return adminFetch(`/users/${userId}/usage-events?limit=${limit}&offset=${offset}`);
};
