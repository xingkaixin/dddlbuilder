import { useMemo, useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthCredits, useAuthIdentity } from '@/auth/AuthSessionProvider';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { creditLedgerOptions } from '@/queries/credits';
import { formatSignedCreditAmount, type CreditLedgerItem } from '@/services/creditService';
import { SettingGroup, SettingRow } from './SettingRow';

const LEDGER_PAGE_SIZE = 20;

const toLedgerBoundary = (value: string, endOfDay = false) => {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay) {
    date.setDate(date.getDate() + 1);
  }

  return date.toISOString();
};

const formatLedgerTime = (value: number) => {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
};

type MetadataValue =
  | string
  | number
  | boolean
  | null
  | MetadataValue[]
  | { [key: string]: MetadataValue };

type MetadataRecord = { [key: string]: MetadataValue };

const parseMetadata = (value?: string | null) => {
  if (!value) return null;

  try {
    // SAFETY: metadata is only read as a record after JSON.parse succeeds; nested values remain opaque.
    return JSON.parse(value) as MetadataRecord;
  } catch {
    return null;
  }
};

const resolveLedgerTypeLabel = (
  t: ReturnType<typeof useTranslation>['t'],
  item: CreditLedgerItem,
) => {
  const metadata = parseMetadata(item.metadataJson);

  if (item.kind === 'refund' && item.source !== 'manual_adjustment') {
    if (metadata?.reason === 'request_failed') {
      return t('settings.kind.aiFailedRefund');
    }

    return t('settings.kind.aiSettlementRefund');
  }

  if (item.kind === 'consume' && item.source !== 'manual_adjustment') {
    return t('settings.kind.aiReservedConsume');
  }

  return t(`settings.kind.${item.kind}`);
};

type CreditsState = {
  ledgerPage: number;
  ledgerStartDate: string;
  ledgerEndDate: string;
  rechargeOpen: boolean;
};

type CreditsEvent =
  | { type: 'ledgerStartDateChanged'; date: string }
  | { type: 'ledgerEndDateChanged'; date: string }
  | { type: 'ledgerFilterCleared' }
  | { type: 'ledgerPreviousPageRequested' }
  | { type: 'ledgerNextPageRequested'; pageCount: number }
  | { type: 'rechargeOpenChanged'; open: boolean };

const initialCreditsState: CreditsState = {
  ledgerPage: 1,
  ledgerStartDate: '',
  ledgerEndDate: '',
  rechargeOpen: false,
};

function creditsReducer(state: CreditsState, event: CreditsEvent): CreditsState {
  switch (event.type) {
    case 'ledgerStartDateChanged':
      return { ...state, ledgerStartDate: event.date, ledgerPage: 1 };
    case 'ledgerEndDateChanged':
      return { ...state, ledgerEndDate: event.date, ledgerPage: 1 };
    case 'ledgerFilterCleared':
      return { ...state, ledgerStartDate: '', ledgerEndDate: '', ledgerPage: 1 };
    case 'ledgerPreviousPageRequested':
      return { ...state, ledgerPage: Math.max(1, state.ledgerPage - 1) };
    case 'ledgerNextPageRequested':
      return { ...state, ledgerPage: Math.min(event.pageCount, state.ledgerPage + 1) };
    case 'rechargeOpenChanged':
      return { ...state, rechargeOpen: event.open };
  }
}

export function CreditSettings() {
  const { t } = useTranslation();
  const { status, userId } = useAuthIdentity();
  const { creditBalance } = useAuthCredits();

  const [{ ledgerPage, ledgerStartDate, ledgerEndDate, rechargeOpen }, dispatch] = useReducer(
    creditsReducer,
    initialCreditsState,
  );

  const ledgerFilters = useMemo(() => {
    const startAt = ledgerStartDate ? toLedgerBoundary(ledgerStartDate) : null;
    const endAt = ledgerEndDate ? toLedgerBoundary(ledgerEndDate, true) : null;

    return {
      limit: LEDGER_PAGE_SIZE,
      offset: (ledgerPage - 1) * LEDGER_PAGE_SIZE,
      ...(startAt ? { startAt } : {}),
      ...(endAt ? { endAt } : {}),
    };
  }, [ledgerEndDate, ledgerPage, ledgerStartDate]);
  const ledgerQuery = useQuery({
    ...creditLedgerOptions(userId ?? '', ledgerFilters),
    placeholderData: (previous, query) => (query?.queryKey[1] === userId ? previous : undefined),
    enabled: status === 'signed_in' && Boolean(userId),
  });
  const ledgerItems = ledgerQuery.data?.items ?? [];
  const ledgerTotal = ledgerQuery.data?.total ?? 0;
  const loadingLedger = ledgerQuery.isFetching;

  const ledgerError = ledgerQuery.isError
    ? ledgerQuery.error instanceof Error
      ? ledgerQuery.error.message
      : t('settings.loadFailed')
    : null;

  const ledgerPageCount = useMemo(
    () => Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE)),
    [ledgerTotal],
  );

  return (
    <SettingGroup id="credits" title={t('settings.creditTab')}>
      <SettingRow title={t('settings.currentBalance')} hint={t('settings.creditHistoryHint')}>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xl">{creditBalance ?? 0}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => dispatch({ type: 'rechargeOpenChanged', open: true })}
          >
            {t('settings.recharge')}
          </Button>
        </div>
      </SettingRow>
      <section className="space-y-3 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="text-sm font-semibold">{t('settings.creditHistory')}</h3>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span>{t('settings.startDate')}</span>
              <Input
                type="date"
                value={ledgerStartDate}
                max={ledgerEndDate || undefined}
                onChange={(event) =>
                  dispatch({ type: 'ledgerStartDateChanged', date: event.target.value })
                }
                className="h-8 text-xs"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span>{t('settings.endDate')}</span>
              <Input
                type="date"
                value={ledgerEndDate}
                min={ledgerStartDate || undefined}
                onChange={(event) =>
                  dispatch({ type: 'ledgerEndDateChanged', date: event.target.value })
                }
                className="h-8 text-xs"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={!ledgerStartDate && !ledgerEndDate}
              onClick={() => dispatch({ type: 'ledgerFilterCleared' })}
            >
              {t('settings.clearFilter')}
            </Button>
          </div>
        </div>
        {ledgerQuery.isPending ? (
          <div className="text-sm text-muted-foreground">{t('settings.loading')}</div>
        ) : ledgerError ? (
          <div className="text-sm text-destructive">{ledgerError}</div>
        ) : ledgerItems.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t('settings.noHistory')}</div>
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border">
            <table className="min-w-full text-sm" aria-busy={loadingLedger}>
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">{t('settings.time')}</th>
                  <th className="px-3 py-2">{t('settings.type')}</th>
                  <th className="px-3 py-2">{t('settings.source')}</th>
                  <th className="px-3 py-2">{t('settings.amount')}</th>
                  <th className="px-3 py-2">{t('settings.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {ledgerItems.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2">{formatLedgerTime(item.createdAt)}</td>
                    <td className="px-3 py-2">{resolveLedgerTypeLabel(t, item)}</td>
                    <td className="px-3 py-2">{t(`settings.sourceMap.${item.source}`)}</td>
                    <td className="px-3 py-2">{formatSignedCreditAmount(item)}</td>
                    <td className="px-3 py-2">{item.balanceAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ledgerTotal > 0 ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t('settings.pagination', {
                page: ledgerPage,
                totalPages: ledgerPageCount,
                total: ledgerTotal,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={ledgerPage <= 1 || loadingLedger}
                onClick={() => dispatch({ type: 'ledgerPreviousPageRequested' })}
                aria-label={t('settings.previousPage')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={ledgerPage >= ledgerPageCount || loadingLedger}
                onClick={() =>
                  dispatch({
                    type: 'ledgerNextPageRequested',
                    pageCount: ledgerPageCount,
                  })
                }
                aria-label={t('settings.nextPage')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>
      <AlertDialog
        open={rechargeOpen}
        onOpenChange={(open) => dispatch({ type: 'rechargeOpenChanged', open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.recharge')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.rechargeNotAvailable')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>{t('settings.acknowledge')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingGroup>
  );
}
