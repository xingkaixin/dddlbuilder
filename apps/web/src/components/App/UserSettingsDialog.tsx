import { ChevronLeft, ChevronRight, Coins, RefreshCw, User2 } from '@/components/icons';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/auth/AuthSessionProvider';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import { useLocale } from '@/i18n/LocaleContext';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { creditLedgerOptions } from '@/queries/credits';
import type { CreditLedgerItem } from '@/services/creditService';

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsTab = 'account' | 'workspace' | 'credits';
const LEDGER_PAGE_SIZE = 20;

const parseLedgerDate = (value: string) => {
  const normalized =
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) || value.includes('GMT')
      ? value
      : `${value.replace(' ', 'T')}Z`;
  return new Date(normalized);
};

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

const formatLedgerTime = (value: string) => {
  const date = parseLedgerDate(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatCompactCredits = (value: number | null | undefined, locale: 'zh-CN' | 'en-US') => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return '0';
  }

  const sign = amount < 0 ? '-' : '';
  const absolute = Math.abs(amount);
  const units =
    locale === 'zh-CN'
      ? [
          { value: 1_000_000_000_000, label: '万亿' },
          { value: 100_000_000, label: '亿' },
          { value: 10_000, label: '万' },
        ]
      : [
          { value: 1_000_000_000, label: 'B' },
          { value: 1_000_000, label: 'M' },
          { value: 1_000, label: 'K' },
        ];

  const unit = units.find((item) => absolute >= item.value);
  if (!unit) {
    return `${amount}`;
  }

  const scaled = absolute / unit.value;
  const decimals = locale === 'zh-CN' && scaled < 10 ? 1 : 2;
  return locale === 'zh-CN'
    ? `${sign}${scaled.toFixed(decimals)} ${unit.label}`
    : `${sign}${scaled.toFixed(decimals)}${unit.label}`;
};

const settingsTabContentClass = 'mt-0 h-full overflow-y-auto pr-1';

const parseMetadata = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
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

export function UserSettingsDialog({ open, onOpenChange }: UserSettingsDialogProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const authSession = useAuthSession();
  const workspaceYDoc = useWorkspaceYDoc();
  const { success, error } = useToast();
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account');
  const compactCreditBalance = formatCompactCredits(authSession.creditBalance, locale);
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
    ...creditLedgerOptions(authSession.userId ?? '', ledgerFilters),
    enabled: open && authSession.status === 'signed_in' && Boolean(authSession.userId),
  });
  const ledgerItems = ledgerQuery.data?.items ?? [];
  const ledgerTotal = ledgerQuery.data?.total ?? 0;
  const loadingLedger = ledgerQuery.isFetching;
  const ledgerError = ledgerQuery.isError
    ? ledgerQuery.error instanceof Error
      ? ledgerQuery.error.message
      : t('settings.loadFailed')
    : null;

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(authSession.name ?? '');
  }, [authSession.name, open]);

  const ledgerPageCount = useMemo(
    () => Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE)),
    [ledgerTotal],
  );

  const handleUpdateName = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      error(t('settings.usernameRequired'));
      return;
    }

    try {
      setSavingName(true);
      await authSession.updateUserName(trimmedName);
      success(t('settings.usernameSuccess'));
    } catch (err) {
      error(err instanceof Error ? err.message : t('settings.usernameFailed'));
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim()) {
      error(t('settings.passwordRequired'));
      return;
    }
    if (newPassword !== confirmPassword) {
      error(t('settings.passwordMismatch'));
      return;
    }

    try {
      setSavingPassword(true);
      await authSession.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      success(t('settings.passwordSuccess'));
    } catch (err) {
      error(err instanceof Error ? err.message : t('settings.passwordFailed'));
    } finally {
      setSavingPassword(false);
    }
  };

  const workspaceStatusKey =
    workspaceYDoc.connectionState === 'offline'
      ? 'offlineLocalSaved'
      : workspaceYDoc.connectionState === 'error'
        ? 'syncFailed'
        : workspaceYDoc.synced
          ? 'cloudSynced'
          : workspaceYDoc.connectionState === 'connecting'
            ? 'syncing'
            : 'localSaved';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="grid h-[min(46rem,calc(100vh-2rem))] w-[min(72rem,calc(100vw-2rem))] max-w-none grid-rows-[auto_1fr] gap-0 overflow-hidden p-0"
          initialFocus={false}
        >
          <DialogHeader className="gap-1 border-b px-6 py-3">
            <DialogTitle className="text-lg">{t('settings.title')}</DialogTitle>
            <DialogDescription className="text-xs">{t('settings.description')}</DialogDescription>
          </DialogHeader>
          <Tabs
            value={settingsTab}
            onValueChange={(value) => setSettingsTab(value as SettingsTab)}
            className="flex min-h-0 overflow-hidden"
          >
            <TabsList className="w-56 shrink-0 self-stretch flex-col justify-start gap-1 rounded-none border-r border-border/70 bg-transparent px-3 py-5">
              <TabsTrigger
                value="account"
                className="w-full justify-start gap-2 px-2.5 py-2 text-xs transition-colors"
              >
                <User2 className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {t('settings.accountTab')}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="workspace"
                className="w-full justify-start gap-2 px-2.5 py-2 text-xs transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {t('settings.workspaceTab')}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="credits"
                className="w-full justify-start gap-2 px-2.5 py-2 text-xs transition-colors"
              >
                <Coins className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate text-left">{t('settings.creditTab')}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {compactCreditBalance}
                </span>
              </TabsTrigger>
            </TabsList>
            <div className="min-w-0 flex-1 overflow-hidden px-6 py-5">
              <TabsContent value="account" className={`${settingsTabContentClass} space-y-6`}>
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">{t('settings.email')}</h3>
                  <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
                    <div className="font-medium">{authSession.email ?? '-'}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t('settings.emailReadonly')}
                    </div>
                  </div>
                </section>
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">{t('settings.username')}</h3>
                  <div className="space-y-2">
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t('settings.usernamePlaceholder')}
                    />
                    <div className="flex justify-end">
                      <Button type="button" onClick={handleUpdateName} disabled={savingName}>
                        {savingName ? t('settings.saving') : t('settings.save')}
                      </Button>
                    </div>
                  </div>
                </section>
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">{t('settings.passwordSection')}</h3>
                  <div className="space-y-2">
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      placeholder={t('settings.currentPassword')}
                      autoComplete="current-password"
                    />
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder={t('settings.newPassword')}
                      autoComplete="new-password"
                    />
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder={t('settings.confirmPassword')}
                      autoComplete="new-password"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={handleChangePassword}
                        disabled={savingPassword}
                      >
                        {savingPassword ? t('settings.saving') : t('settings.updatePassword')}
                      </Button>
                    </div>
                  </div>
                </section>
              </TabsContent>
              <TabsContent value="workspace" className={`${settingsTabContentClass} space-y-5`}>
                <section className="space-y-3">
                  <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
                    {t('settings.workspaceSyncHint')}
                  </div>
                  <div className="rounded-md border bg-card px-3 py-2.5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm">
                        <div className="flex items-center gap-2 font-medium">
                          <RefreshCw className="h-4 w-4" />
                          {t(`workspaceYDoc.status.${workspaceStatusKey}`)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t('settings.workspaceSyncDescription')}
                        </div>
                      </div>
                      {workspaceYDoc.connectionState === 'error' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={workspaceYDoc.retry}
                        >
                          {t('workspaceYDoc.status.retry')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </section>
                {authSession.status !== 'signed_in' ? (
                  <p className="text-sm text-muted-foreground">{t('settings.syncRequiresLogin')}</p>
                ) : null}
              </TabsContent>
              <TabsContent value="credits" className={`${settingsTabContentClass} space-y-4`}>
                <section className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {t('settings.currentBalance')}
                    </div>
                    <div className="text-2xl font-semibold">{authSession.creditBalance ?? 0}</div>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setRechargeOpen(true)}>
                    {t('settings.recharge')}
                  </Button>
                </section>
                <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  {t('settings.creditHistoryHint')}
                </div>
                <section className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <h3 className="text-sm font-semibold">{t('settings.creditHistory')}</h3>
                    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        <span>{t('settings.startDate')}</span>
                        <Input
                          type="date"
                          value={ledgerStartDate}
                          max={ledgerEndDate || undefined}
                          onChange={(event) => {
                            setLedgerStartDate(event.target.value);
                            setLedgerPage(1);
                          }}
                          className="h-8 text-xs"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        <span>{t('settings.endDate')}</span>
                        <Input
                          type="date"
                          value={ledgerEndDate}
                          min={ledgerStartDate || undefined}
                          onChange={(event) => {
                            setLedgerEndDate(event.target.value);
                            setLedgerPage(1);
                          }}
                          className="h-8 text-xs"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        disabled={!ledgerStartDate && !ledgerEndDate}
                        onClick={() => {
                          setLedgerStartDate('');
                          setLedgerEndDate('');
                          setLedgerPage(1);
                        }}
                      >
                        {t('settings.clearFilter')}
                      </Button>
                    </div>
                  </div>
                  {loadingLedger ? (
                    <div className="text-sm text-muted-foreground">{t('settings.loading')}</div>
                  ) : ledgerError ? (
                    <div className="text-sm text-destructive">{ledgerError}</div>
                  ) : ledgerItems.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('settings.noHistory')}</div>
                  ) : (
                    <div className="max-h-72 overflow-auto rounded-lg border">
                      <table className="min-w-full text-sm">
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
                              <td className="px-3 py-2">
                                {t(`settings.sourceMap.${item.source}`)}
                              </td>
                              <td className="px-3 py-2">
                                {item.kind === 'consume' ? '-' : '+'}
                                {item.amount}
                              </td>
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
                          onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}
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
                            setLedgerPage((page) => Math.min(ledgerPageCount, page + 1))
                          }
                          aria-label={t('settings.nextPage')}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
      <AlertDialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
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
    </>
  );
}
