import {
  decodeCreditBalanceResponse,
  decodeCreditLedgerResponse,
  type CreditLedgerItem as WireCreditLedgerItem,
} from '@ddlbuilder/shared-types/api';
import { decodeApiError } from '@ddlbuilder/shared-types/api-contracts';
import { ApiError } from '@/services/apiError';

export type CreditLedgerItem = Omit<WireCreditLedgerItem, 'createdAt'> & { createdAt: number };

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

export const formatSignedCreditAmount = (item: Pick<CreditLedgerItem, 'kind' | 'amount'>) =>
  `${item.kind === 'consume' ? '-' : '+'}${item.amount}`;

export async function fetchCreditBalance(signal?: AbortSignal): Promise<number> {
  const response = await fetch('/api/credits/balance', {
    credentials: 'include',
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = decodeApiError(payload);
    throw new ApiError(error.error ?? 'Failed to load credit balance', response.status, error.code);
  }
  const decoded = decodeCreditBalanceResponse(payload);
  if (decoded._tag === 'None') throw new Error('Invalid credit balance response');
  return decoded.value.balance;
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
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = decodeApiError(payload);
    throw new ApiError(error.error ?? 'Failed to load credit ledger', response.status, error.code);
  }
  const decoded = decodeCreditLedgerResponse(payload);
  if (decoded._tag === 'None') throw new Error('Invalid credit ledger response');
  return {
    items: decoded.value.items.map((item) => ({ ...item, createdAt: Date.parse(item.createdAt) })),
    total: decoded.value.total,
  };
}
