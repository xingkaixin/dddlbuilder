import { queryOptions } from '@tanstack/react-query';
import {
  fetchCreditBalance,
  fetchCreditLedger,
  type CreditLedgerFilters,
} from '@/services/creditService';

const CREDIT_LEDGER_STALE_TIME_MS = 15_000;
const CREDIT_BALANCE_STALE_TIME_MS = 10_000;

export const creditQueryKeys = {
  all: (userId: string) => ['credits', userId] as const,
  balance: (userId: string) => ['credits', userId, 'balance'] as const,
  ledger: (userId: string, filters: CreditLedgerFilters) =>
    ['credits', userId, 'ledger', filters] as const,
};

export function creditLedgerOptions(userId: string, filters: CreditLedgerFilters) {
  return queryOptions({
    queryKey: creditQueryKeys.ledger(userId, filters),
    queryFn: ({ signal }) => fetchCreditLedger(filters, signal),
    staleTime: CREDIT_LEDGER_STALE_TIME_MS,
  });
}

export function creditBalanceOptions(userId: string) {
  return queryOptions({
    queryKey: creditQueryKeys.balance(userId),
    queryFn: async ({ signal }) => {
      try {
        return await fetchCreditBalance(signal);
      } catch (error) {
        if (!signal.aborted) console.error('[auth] failed to load credit balance', error);

        throw error;
      }
    },
    staleTime: CREDIT_BALANCE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}
