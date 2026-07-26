import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Coins,
  Download,
  RefreshCw,
  User2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { syncWorkspaceOnce } from '@/services/workspaceIncrementalSyncService';
import { exportWorkspaceToCloud, importWorkspaceFromCloud } from '@/services/workspaceSyncService';
import type { ApiErrorPayload } from '@ddlbuilder/shared-types/api';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';
import {
  pruneResolvedWorkspaceConflicts,
  removeWorkspaceConflicts,
  type LocalWorkspaceConflictItem,
} from '@/utils/workspaceSyncStateDb';

type CreditLedgerItem = {
  id: string;
  kind: 'grant' | 'consume' | 'refund';
  source: 'signup_bonus' | 'ai_generate' | 'ai_review' | 'ai_explain' | 'manual_adjustment';
  amount: number;
  balanceAfter: number;
  createdAt: string;
  metadataJson?: string | null;
};

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WorkspaceSyncAction = 'upload' | 'download';
type SettingsTab = 'account' | 'workspace' | 'credits';
const LEDGER_PAGE_SIZE = 20;

const getErrorMessage = (payload: ApiErrorPayload | null, fallback: string) =>
  payload && typeof payload.error === 'string' ? payload.error : fallback;

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

const formatSyncConflictTime = (value: number) =>
  new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

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
  const { success, error } = useToast();
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerItems, setLedgerItems] = useState<CreditLedgerItem[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [pendingSyncAction, setPendingSyncAction] = useState<WorkspaceSyncAction | null>(null);
  const [runningSyncAction, setRunningSyncAction] = useState<WorkspaceSyncAction | null>(null);
  const [runningIncrementalSync, setRunningIncrementalSync] = useState(false);
  const [workspaceConflictCount, setWorkspaceConflictCount] = useState(0);
  const [workspaceConflicts, setWorkspaceConflicts] = useState<LocalWorkspaceConflictItem[]>([]);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account');
  const [conflictDetailsOpen, setConflictDetailsOpen] = useState(false);
  const compactCreditBalance = formatCompactCredits(authSession.creditBalance, locale);

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

  const loadLedger = useCallback(
    async (signal: AbortSignal) => {
      try {
        setLoadingLedger(true);
        setLedgerError(null);
        const params = new URLSearchParams({
          limit: String(LEDGER_PAGE_SIZE),
          offset: String((ledgerPage - 1) * LEDGER_PAGE_SIZE),
        });
        const startAt = ledgerStartDate ? toLedgerBoundary(ledgerStartDate) : null;
        const endAt = ledgerEndDate ? toLedgerBoundary(ledgerEndDate, true) : null;
        if (startAt) params.set('startAt', startAt);
        if (endAt) params.set('endAt', endAt);

        const response = await fetch(`/api/credits/ledger?${params.toString()}`, {
          credentials: 'include',
          signal,
        });
        const payload = (await response.json().catch(() => null)) as {
          items?: CreditLedgerItem[];
          total?: number;
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload as ApiErrorPayload | null, t('settings.loadFailed')),
          );
        }
        setLedgerItems(Array.isArray(payload?.items) ? payload.items : []);
        setLedgerTotal(Number.isFinite(payload?.total) ? Number(payload?.total) : 0);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setLedgerError(err instanceof Error ? err.message : t('settings.loadFailed'));
        }
      } finally {
        if (!signal.aborted) {
          setLoadingLedger(false);
        }
      }
    },
    [ledgerEndDate, ledgerPage, ledgerStartDate, t],
  );

  useEffect(() => {
    setLedgerPage(1);
  }, [ledgerEndDate, ledgerStartDate]);

  useEffect(() => {
    if (!open || authSession.status !== 'signed_in') {
      return;
    }

    const controller = new AbortController();
    void loadLedger(controller.signal);

    return () => {
      controller.abort();
    };
  }, [authSession.status, loadLedger, open]);

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

  const currentScope = useMemo(
    () =>
      authSession.status === 'signed_in' && authSession.userId
        ? {
            kind: 'user' as const,
            userId: authSession.userId,
            ...(authSession.workspaceId ? { workspaceId: authSession.workspaceId } : {}),
          }
        : getAnonymousWorkspaceScope(),
    [authSession.status, authSession.userId, authSession.workspaceId],
  );

  const refreshWorkspaceConflictCount = useCallback(async () => {
    if (currentScope.kind !== 'user' || !currentScope.workspaceId) {
      setWorkspaceConflicts([]);
      setWorkspaceConflictCount(0);
      return;
    }
    const conflicts = await pruneResolvedWorkspaceConflicts(currentScope.workspaceId);
    setWorkspaceConflicts(conflicts);
    setWorkspaceConflictCount(conflicts.length);
  }, [currentScope]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void refreshWorkspaceConflictCount();
  }, [open, refreshWorkspaceConflictCount]);

  const handleRunIncrementalSync = async () => {
    if (currentScope.kind !== 'user' || !currentScope.workspaceId) {
      error(t('settings.syncRequiresLogin'));
      return;
    }

    try {
      setRunningIncrementalSync(true);
      const result = await syncWorkspaceOnce(currentScope);
      await refreshWorkspaceConflictCount();
      if (result.status === 'conflict') {
        error(t('settings.syncConflictNotice', { count: result.conflictCount }));
        return;
      }
      success(t('settings.syncNowSuccess'));
    } catch (err) {
      error(err instanceof Error ? err.message : t('settings.syncFailed'));
    } finally {
      setRunningIncrementalSync(false);
    }
  };

  const handleRemoveWorkspaceConflict = async (id: string) => {
    await removeWorkspaceConflicts([id]);
    await refreshWorkspaceConflictCount();
    success(t('settings.syncConflictCleared'));
  };

  const handleConfirmWorkspaceSync = async () => {
    if (!pendingSyncAction) {
      return;
    }

    try {
      setRunningSyncAction(pendingSyncAction);
      if (pendingSyncAction === 'upload') {
        await exportWorkspaceToCloud(currentScope);
        success(t('settings.syncUploadSuccess'));
      } else {
        await importWorkspaceFromCloud(currentScope);
        success(t('settings.syncDownloadSuccess'));
      }
      setPendingSyncAction(null);
    } catch (err) {
      error(err instanceof Error ? err.message : t('settings.syncFailed'));
    } finally {
      setRunningSyncAction(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="grid h-[min(46rem,calc(100vh-2rem))] w-[min(72rem,calc(100vw-2rem))] max-w-none grid-rows-[auto_1fr] gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
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
                {workspaceConflictCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                    {workspaceConflictCount}
                  </span>
                ) : null}
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
                  <div
                    className={`rounded-md border px-3 py-2.5 ${
                      workspaceConflictCount > 0
                        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                        : 'bg-card'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm">
                        <div className="flex items-center gap-2 font-medium">
                          {workspaceConflictCount > 0 ? (
                            <AlertTriangle className="h-4 w-4" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          {t('settings.syncNow')}
                        </div>
                        {workspaceConflictCount > 0 ? (
                          <div className="mt-1 text-xs">
                            {t('settings.syncConflictNotice', {
                              count: workspaceConflictCount,
                            })}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t('settings.syncNowDescription')}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {workspaceConflictCount > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setConflictDetailsOpen((value) => !value)}
                          >
                            {t('settings.viewSyncConflicts')}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant={workspaceConflictCount > 0 ? 'default' : 'outline'}
                          size="sm"
                          onClick={handleRunIncrementalSync}
                          disabled={
                            runningIncrementalSync ||
                            runningSyncAction != null ||
                            authSession.status !== 'signed_in' ||
                            !authSession.workspaceId
                          }
                        >
                          {runningIncrementalSync
                            ? t('settings.syncNowRunning')
                            : t('settings.syncNow')}
                        </Button>
                      </div>
                    </div>
                    {conflictDetailsOpen && workspaceConflicts.length > 0 ? (
                      <div className="mt-3 max-h-72 overflow-auto rounded-md border bg-background">
                        {workspaceConflicts.map((conflict) => (
                          <div
                            key={conflict.id}
                            className="flex gap-3 border-b px-3 py-2.5 text-xs last:border-b-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-foreground">
                                {t(`settings.workspaceEntityType.${conflict.entityType}`)} ·{' '}
                                {conflict.entityId}
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                {t('settings.syncConflictDetail', {
                                  version: conflict.serverVersion,
                                  time: formatSyncConflictTime(conflict.updatedAt),
                                })}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => void handleRemoveWorkspaceConflict(conflict.id)}
                            >
                              {t('settings.clearSyncConflict')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
                <section className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-3 rounded-lg border p-4">
                    <div>
                      <h4 className="flex items-center gap-2 text-sm font-semibold">
                        <CloudUpload className="h-4 w-4" />
                        {t('settings.syncUpload')}
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('settings.syncUploadDescription')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setPendingSyncAction('upload')}
                      disabled={runningSyncAction != null || authSession.status !== 'signed_in'}
                    >
                      {runningSyncAction === 'upload'
                        ? t('settings.syncUploading')
                        : t('settings.syncUpload')}
                    </Button>
                  </div>
                  <div className="space-y-3 rounded-lg border p-4">
                    <div>
                      <h4 className="flex items-center gap-2 text-sm font-semibold">
                        <Download className="h-4 w-4" />
                        {t('settings.syncDownload')}
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('settings.syncDownloadDescription')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPendingSyncAction('download')}
                      disabled={runningSyncAction != null || authSession.status !== 'signed_in'}
                    >
                      {runningSyncAction === 'download'
                        ? t('settings.syncDownloading')
                        : t('settings.syncDownload')}
                    </Button>
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
                          onChange={(event) => setLedgerStartDate(event.target.value)}
                          className="h-8 text-xs"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-muted-foreground">
                        <span>{t('settings.endDate')}</span>
                        <Input
                          type="date"
                          value={ledgerEndDate}
                          min={ledgerStartDate || undefined}
                          onChange={(event) => setLedgerEndDate(event.target.value)}
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
      <AlertDialog
        open={pendingSyncAction != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && runningSyncAction == null) {
            setPendingSyncAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingSyncAction === 'upload'
                ? t('settings.syncUploadConfirmTitle')
                : t('settings.syncDownloadConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSyncAction === 'upload'
                ? t('settings.syncUploadConfirmDescription')
                : t('settings.syncDownloadConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingSyncAction(null)}
              disabled={runningSyncAction != null}
            >
              {t('settings.cancel')}
            </Button>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmWorkspaceSync();
              }}
            >
              {runningSyncAction != null
                ? t('settings.saving')
                : pendingSyncAction === 'upload'
                  ? t('settings.syncUpload')
                  : t('settings.syncDownload')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
