import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Mail, Ban, PlusCircle } from '@/components/icons';
import {
  resetUserPassword,
  disableUser,
  enableUser,
  updateUserEmailVerification,
  grantUserCredits,
} from './lib/adminApi';
import {
  adminLedgerOptions,
  adminQueryKeys,
  adminUsageOptions,
  adminUserOptions,
} from '@/queries/admin';

const isValidCreditAmount = (value: string) => {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0;
};

type AdminUserDetailProps = {
  userId: string;
  onBack: () => void;
};

export function AdminUserDetailView({ userId, onBack }: AdminUserDetailProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('credits');
  const userQuery = useQuery(adminUserOptions(userId));
  const ledgerQuery = useQuery(adminLedgerOptions(userId, 50));
  const usageQuery = useQuery({
    ...adminUsageOptions(userId, 50, 0),
    enabled: activeTab === 'usage',
  });

  // Dialogs
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);

  // Forms
  const [disableReason, setDisableReason] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const resetPasswordMutation = useMutation({
    mutationFn: () => resetUserPassword(userId),
    retry: false,
  });
  const disableMutation = useMutation({
    mutationFn: (reason?: string) => disableUser(userId, reason),
    retry: false,
  });
  const enableMutation = useMutation({
    mutationFn: () => enableUser(userId),
    retry: false,
  });
  const emailVerificationMutation = useMutation({
    mutationFn: (verified: boolean) => updateUserEmailVerification(userId, verified),
    retry: false,
  });
  const grantCreditsMutation = useMutation({
    mutationFn: ({ amount, note }: { amount: number; note?: string }) =>
      grantUserCredits(userId, amount, note),
    retry: false,
  });

  const handleResetPassword = async () => {
    try {
      await resetPasswordMutation.mutateAsync();
      toast.success(t('admin.detail.resetEmailSent'));
    } catch {
      toast.error('Failed to send reset email');
    }
  };

  const handleDisable = async () => {
    try {
      await disableMutation.mutateAsync(disableReason || undefined);
      toast.success(t('admin.detail.disableSuccess'));
      setDisableDialogOpen(false);
      setDisableReason('');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersRoot });
    } catch {
      toast.error('Failed to disable user');
    }
  };

  const handleEnable = async () => {
    try {
      await enableMutation.mutateAsync();
      toast.success(t('admin.detail.enableSuccess'));
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersRoot });
    } catch {
      toast.error('Failed to enable user');
    }
  };

  const handleEmailVerification = async (verified: boolean) => {
    try {
      await emailVerificationMutation.mutateAsync(verified);
      toast.success(
        verified
          ? t('admin.detail.markEmailVerifiedSuccess')
          : t('admin.detail.markEmailUnverifiedSuccess'),
      );
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersRoot });
    } catch {
      toast.error('Failed to update email verification');
    }
  };

  const handleGrantCredits = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(creditAmount);
    if (!isValidCreditAmount(creditAmount)) return;

    try {
      await grantCreditsMutation.mutateAsync({ amount, note: creditNote || undefined });
      toast.success(t('admin.detail.creditsAdded', { amount }));
      setCreditsDialogOpen(false);
      setCreditAmount('');
      setCreditNote('');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.usersRoot });
    } catch {
      toast.error('Failed to grant credits');
    }
  };

  if (userQuery.isPending) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">...</div>;
  }

  if (userQuery.isError) {
    return (
      <div className="py-20 text-center">
        <p className="text-destructive">
          {userQuery.error instanceof Error ? userQuery.error.message : 'Failed to load user'}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void userQuery.refetch()}>
          {t('common.retry', '重试')}
        </Button>
      </div>
    );
  }

  const user = userQuery.data;
  const ledger = ledgerQuery.data ?? [];
  const usageEvents = usageQuery.data?.items ?? [];
  const usageTotal = usageQuery.data?.total ?? 0;

  const formatKind = (kind: string) => {
    switch (kind) {
      case 'grant':
        return t('admin.detail.credits.grant');
      case 'consume':
        return t('admin.detail.credits.consume');
      case 'refund':
        return t('admin.detail.credits.refund');
      default:
        return kind;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('admin.detail.back')}
        </Button>
      </div>

      {/* User info */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              {user.name || '-'}
              {user.disabled && (
                <span className="ml-2 inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  {t('admin.users.disabled')}
                </span>
              )}
            </h2>
            <p className="font-mono text-sm text-muted-foreground">{user.email}</p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>
                {t('admin.users.verified')}:{' '}
                {user.emailVerified
                  ? t('admin.detail.emailVerified')
                  : t('admin.detail.emailUnverified')}
              </span>
              <span>
                {t('admin.users.balance')}: {user.balance}
              </span>
              <span>
                {t('admin.users.createdAt')}: {new Date(user.createdAt).toLocaleDateString()}
              </span>
              {user.lastActiveAt && (
                <span>Last active: {new Date(user.lastActiveAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleResetPassword}>
              <Mail className="mr-1.5 h-4 w-4" />
              {t('admin.detail.sendResetEmail')}
            </Button>

            {user.emailVerified ? (
              <Button variant="outline" size="sm" onClick={() => handleEmailVerification(false)}>
                {t('admin.detail.markEmailUnverified')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => handleEmailVerification(true)}>
                {t('admin.detail.markEmailVerified')}
              </Button>
            )}

            {user.disabled ? (
              <Button variant="outline" size="sm" onClick={handleEnable}>
                <PlusCircle className="mr-1.5 h-4 w-4" />
                {t('admin.detail.enableUser')}
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setDisableDialogOpen(true)}>
                <Ban className="mr-1.5 h-4 w-4" />
                {t('admin.detail.disableUser')}
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setCreditsDialogOpen(true)}>
              <PlusCircle className="mr-1.5 h-4 w-4" />
              {t('admin.detail.addCredits')}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs: Credits + Usage */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="credits">{t('admin.detail.tabs.credits')}</TabsTrigger>
          <TabsTrigger value="usage">{t('admin.detail.tabs.usage')}</TabsTrigger>
        </TabsList>

        <TabsContent value="credits" className="mt-4">
          {ledgerQuery.isPending ? (
            <div className="py-8 text-center text-muted-foreground">...</div>
          ) : ledgerQuery.isError ? (
            <div className="py-8 text-center text-destructive">Failed to load credit ledger</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">
                      {t('admin.detail.credits.kind')}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      {t('admin.detail.credits.source')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      {t('admin.detail.credits.amount')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      {t('admin.detail.credits.balanceAfter')}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      {t('admin.detail.credits.createdAt')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        {t('common.noData', '暂无数据')}
                      </td>
                    </tr>
                  ) : (
                    ledger.map((item) => (
                      <tr key={item.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3">
                          <span
                            className={
                              item.kind === 'grant'
                                ? 'text-green-600 dark:text-green-400'
                                : item.kind === 'consume'
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-blue-600 dark:text-blue-400'
                            }
                          >
                            {formatKind(item.kind)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{item.source}</td>
                        <td className="px-4 py-3 text-right tabular-nums">+{item.amount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.balanceAfter}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(item.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          {usageQuery.isPending ? (
            <div className="py-8 text-center text-muted-foreground">...</div>
          ) : usageQuery.isError ? (
            <div className="py-8 text-center text-destructive">Failed to load usage events</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">
                      {t('admin.detail.usage.route')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      {t('admin.detail.usage.estimatedTokens')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      {t('admin.detail.usage.actualTokens')}
                    </th>
                    <th className="px-4 py-3 text-center font-medium">
                      {t('admin.detail.usage.status')}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      {t('admin.detail.usage.createdAt')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usageEvents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        {t('common.noData', '暂无数据')}
                      </td>
                    </tr>
                  ) : (
                    usageEvents.map((item) => (
                      <tr key={item.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3 font-mono text-xs">{item.routeKey}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {item.estimatedTokens}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {item.actualTotalTokens ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={
                              item.status === 'succeeded'
                                ? 'text-green-600 dark:text-green-400'
                                : item.status === 'failed'
                                  ? 'text-red-600 dark:text-red-400'
                                  : ''
                            }
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(item.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                {t('admin.detail.usage.total', { count: usageTotal })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Disable User Dialog */}
      <AlertDialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.detail.disableUser')}</AlertDialogTitle>
            <AlertDialogDescription>{t('admin.detail.disableConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)}
            placeholder={t('admin.detail.disableReason')}
            rows={2}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', '取消')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisable}>
              {t('admin.detail.disableUser')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Credits Dialog */}
      <AlertDialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
        <AlertDialogContent>
          <form onSubmit={handleGrantCredits}>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('admin.detail.addCredits')}</AlertDialogTitle>
              <AlertDialogDescription />
            </AlertDialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('admin.detail.amount')}</label>
                <Input
                  type="number"
                  min={1}
                  max={Number.MAX_SAFE_INTEGER}
                  step={1}
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="100"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('admin.detail.note')}</label>
                <Input
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  placeholder={t('admin.detail.notePlaceholder', '可选备注')}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{t('common.cancel', '取消')}</AlertDialogCancel>
              <Button type="submit" disabled={!isValidCreditAmount(creditAmount)}>
                {t('admin.detail.addCreditsSubmit')}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
