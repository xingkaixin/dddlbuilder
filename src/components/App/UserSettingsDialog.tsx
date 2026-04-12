import { useEffect, useState } from 'react';
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
import {
  exportWorkspaceToCloud,
  importWorkspaceFromCloud,
} from '@/services/workspaceSyncService';
import type { ApiErrorPayload } from '@/types/api';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';

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

const getErrorMessage = (payload: ApiErrorPayload | null, fallback: string) =>
  payload && typeof payload.error === 'string' ? payload.error : fallback;

const parseLedgerDate = (value: string) => {
  const normalized =
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) || value.includes('GMT')
      ? value
      : `${value.replace(' ', 'T')}Z`;
  return new Date(normalized);
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
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [pendingSyncAction, setPendingSyncAction] = useState<WorkspaceSyncAction | null>(null);
  const [runningSyncAction, setRunningSyncAction] = useState<WorkspaceSyncAction | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(authSession.name ?? '');
  }, [authSession.name, open]);

  useEffect(() => {
    if (!open || authSession.status !== 'signed_in') {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setLoadingLedger(true);
        setLedgerError(null);
        const response = await fetch('/api/credits/ledger?limit=50', {
          credentials: 'include',
        });
        const payload = (await response.json().catch(() => null)) as {
          items?: CreditLedgerItem[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload as ApiErrorPayload | null, t('settings.loadFailed')),
          );
        }
        if (!cancelled) {
          setLedgerItems(Array.isArray(payload?.items) ? payload.items : []);
        }
      } catch (err) {
        if (!cancelled) {
          setLedgerError(err instanceof Error ? err.message : t('settings.loadFailed'));
        }
      } finally {
        if (!cancelled) {
          setLoadingLedger(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authSession.status, open, t]);

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

  const currentScope =
    authSession.status === 'signed_in' && authSession.userId
      ? { kind: 'user' as const, userId: authSession.userId }
      : getAnonymousWorkspaceScope();

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
        <DialogContent className="max-w-3xl sm:min-h-[42rem]">
          <DialogHeader>
            <DialogTitle>{t('settings.title')}</DialogTitle>
            <DialogDescription>{t('settings.description')}</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="account" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="account">{t('settings.accountTab')}</TabsTrigger>
              <TabsTrigger value="workspace">{t('settings.workspaceTab')}</TabsTrigger>
              <TabsTrigger value="credits">{t('settings.creditTab')}</TabsTrigger>
            </TabsList>
            <div className="min-h-[30rem]">
              <TabsContent value="account" className="mt-0 space-y-6">
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
              <TabsContent value="workspace" className="mt-0 space-y-6">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">{t('settings.workspaceTab')}</h3>
                  <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    {t('settings.workspaceSyncHint')}
                  </div>
                </section>
                <section className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3 rounded-lg border p-4">
                    <div>
                      <h4 className="text-sm font-semibold">{t('settings.syncUpload')}</h4>
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
                      <h4 className="text-sm font-semibold">{t('settings.syncDownload')}</h4>
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
              <TabsContent value="credits" className="mt-0 space-y-4">
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
                  <h3 className="text-sm font-semibold">{t('settings.creditHistory')}</h3>
                  {loadingLedger ? (
                    <div className="text-sm text-muted-foreground">{t('settings.loading')}</div>
                  ) : ledgerError ? (
                    <div className="text-sm text-destructive">{ledgerError}</div>
                  ) : ledgerItems.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('settings.noHistory')}</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
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
