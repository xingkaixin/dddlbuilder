import type { ApiErrorPayload } from '@ddlbuilder/shared-types/api';
import { ApiError } from '@/services/apiError';

export type CreditLedgerItem = {
  id: string;
  kind: 'grant' | 'consume' | 'refund';
  source: 'signup_bonus' | 'ai_generate' | 'ai_review' | 'ai_explain' | 'manual_adjustment';
  amount: number;
  balanceAfter: number;
  createdAt: string;
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
    | (ApiErrorPayload & Partial<CreditLedgerPage>)
    | null;
  if (!response.ok) {
    throw new ApiError(payload?.error ?? 'Failed to load credit ledger', response.status);
  }

  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    total: Number.isFinite(payload?.total) ? Number(payload?.total) : 0,
  };
}
