import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Loader2,
  RefreshCw,
  WifiOff,
} from '@/components/icons';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';

export function WorkspaceYDocStatus() {
  const { t } = useTranslation();
  const workspaceYDoc = useWorkspaceYDoc();
  const status = useMemo(() => {
    if (!workspaceYDoc.localSynced) {
      return {
        icon: Loader2,
        label: t('workspaceYDoc.status.syncing'),
        className: 'border-border bg-muted/60 text-muted-foreground',
        iconClassName: 'animate-spin',
      };
    }
    if (workspaceYDoc.connectionState === 'connected' && workspaceYDoc.synced) {
      return {
        icon: CheckCircle2,
        label: t('workspaceYDoc.status.cloudSynced'),
        className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        iconClassName: '',
      };
    }
    if (workspaceYDoc.connectionState === 'connecting') {
      return {
        icon: Loader2,
        label: t('workspaceYDoc.status.syncing'),
        className: 'border-primary/20 bg-primary/10 text-primary',
        iconClassName: 'animate-spin',
      };
    }
    if (workspaceYDoc.connectionState === 'offline') {
      return {
        icon: WifiOff,
        label: t('workspaceYDoc.status.offlineLocalSaved'),
        className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        iconClassName: '',
      };
    }
    if (workspaceYDoc.connectionState === 'error') {
      const label =
        workspaceYDoc.failureReason === 'auth'
          ? t('workspaceYDoc.status.authFailed')
          : workspaceYDoc.failureReason === 'service_unavailable'
            ? t('workspaceYDoc.status.serviceUnavailable')
            : workspaceYDoc.failureReason === 'network'
              ? t('workspaceYDoc.status.networkFailed')
              : t('workspaceYDoc.status.syncFailed');
      return {
        icon: AlertCircle,
        label,
        className: 'border-destructive/20 bg-destructive/10 text-destructive',
        iconClassName: '',
      };
    }
    return {
      icon: HardDrive,
      label: t('workspaceYDoc.status.localSaved'),
      className: 'border-border bg-muted/60 text-muted-foreground',
      iconClassName: '',
    };
  }, [
    t,
    workspaceYDoc.connectionState,
    workspaceYDoc.failureReason,
    workspaceYDoc.localSynced,
    workspaceYDoc.synced,
  ]);
  const StatusIcon = status.icon;

  return (
    <div
      role="status"
      data-testid="workspace-yjs-status"
      className={`inline-flex h-8 max-w-[16rem] items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${status.className}`}
    >
      <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${status.iconClassName}`} aria-hidden />
      <span className="min-w-0 truncate">{status.label}</span>
      {workspaceYDoc.connectionState === 'error' ? (
        <button
          type="button"
          className="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('workspaceYDoc.status.retry')}
          onClick={workspaceYDoc.retry}
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
