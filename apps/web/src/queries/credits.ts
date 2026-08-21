import { queryOptions } from '@tanstack/react-query';
import { fetchCreditLedger, type CreditLedgerFilters } from '@/services/creditService';

const CREDIT_LEDGER_STALE_TIME_MS = 15_000;

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
