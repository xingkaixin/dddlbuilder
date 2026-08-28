import type { ApiErrorPayload } from '@ddlbuilder/shared-types/api';
import { ApiError } from '@/services/apiError';

export type CreditLedgerItem = {
  id: string;
  kind: 'grant' | 'consume' | 'refund';
  source: 'signup_bonus' | 'ai_generate' | 'ai_review' | 'ai_explain' | 'manual_adjustment';
  amount: number;
  balanceAfter: number;
  createdAt: number;
  metadataJson?: string | null;
};

export type CreditLedgerPage = {
  items: CreditLedgerItem[];
  total: number;
};

export type CreditLedgerFilters = {
  limit: number;
  offset: number;
  startAt?: string;
  endAt?: string;
};

export async function fetchCreditBalance(signal?: AbortSignal): Promise<number> {
  const response = await fetch('/api/credits/balance', {
    credentials: 'include',
    signal,
  });
  const payload = (await response.json().catch(() => null)) as {
    balance?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to load credit balance';
    throw new ApiError(message, response.status);
  }
  return typeof payload?.balance === 'number' ? payload.balance : 0;
}

export async function fetchCreditLedger(
  filters: CreditLedgerFilters,
  signal?: AbortSignal,
): Promise<CreditLedgerPage> {
  const params = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
  });
  if (filters.startAt) params.set('startAt', filters.startAt);
  if (filters.endAt) params.set('endAt', filters.endAt);

  const response = await fetch(`/api/credits/ledger?${params.toString()}`, {
    credentials: 'include',
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | (ApiErrorPayload & {
        items?: Array<Omit<CreditLedgerItem, 'createdAt'> & { createdAt: string }>;
        total?: number;
      })
    | null;
  if (!response.ok) {
    throw new ApiError(payload?.error ?? 'Failed to load credit ledger', response.status);
  }

  return {
    items: Array.isArray(payload?.items)
      ? payload.items.map((item) => {
          const createdAt = Date.parse(item.createdAt);
          if (!Number.isFinite(createdAt)) throw new Error('Invalid credit ledger timestamp');
          return { ...item, createdAt };
        })
      : [],
    total: Number.isFinite(payload?.total) ? Number(payload?.total) : 0,
  };
}
