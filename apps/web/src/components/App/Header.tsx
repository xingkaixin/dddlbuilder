import { memo, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { AppLocale } from '@ddlbuilder/shared-types/locale';
import type { ParsedResult } from '@/utils/SqlParser';
import packageInfo from '../../../package.json';
import {
  Share2,
  FileInput,
  Loader2,
  BookOpen,
  LogIn,
  LogOut,
  MailCheck,
  Settings,
  Sparkles,
  MessageCircle,
  MoreHorizontal,
  Languages,
  Laptop,
  Moon,
  Sun,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/i18n/LocaleContext';
import { getDocsUrl } from '@/utils/docsLink';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useToast } from '@/hooks/useToast';
import { useWorkspaceMigration } from '@/hooks/useWorkspaceMigration';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from 'next-themes';
import { useThemeTransition } from './hooks/useThemeTransition';
import { UserSettingsDialog } from './UserSettingsDialog';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import { TurnstileWidget } from '@/auth/TurnstileWidget';
import type { SavedTableSummary, SaveTableResult } from '@/hooks/useSavedTables';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { PersistedState } from '@ddlbuilder/shared-types';

const ImportSqlDialog = lazy(() =>
  import('@/components/ImportSqlDialog').then((module) => ({
    default: module.ImportSqlDialog,
  })),
);

const FEEDBACK_URL = 'https://my.feishu.cn/share/base/form/shrcnqGnCdcvgRomQ5syagGW2He';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';

interface HeaderProps {
  onShare: () => void;
  isSharing: boolean;
  currentDbType: DatabaseType;
  onImport: (result: ParsedResult, dbType: DatabaseType) => void;
  onPlayFireworks?: () => void;
  savedTables: SavedTableSummary[];
  folderTree: FolderTreeNode[];
  onBatchImportComplete: () => void;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (normalizedName: string, state: PersistedState) => Promise<SaveTableResult>;
  moveTableToFolder: (normalizedName: string, folderId?: string) => Promise<SaveTableResult>;
  onOpenAIGenerate?: () => void;
}

function WorkspaceYDocStatus() {
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

export const Header = memo<HeaderProps>(
  ({
    onShare,
    isSharing,
    currentDbType,
    onImport,
    onPlayFireworks,
    savedTables,
    folderTree,
    onBatchImportComplete,
    saveTable,
    overwriteTable,
    moveTableToFolder,
    onOpenAIGenerate = () => {},
  }) => {
    const { t } = useTranslation();
    const { locale, setLocale } = useLocale();
    const { success, error } = useToast();
    const docsUrl = getDocsUrl(locale);
    const authSession = useAuthSession();
    const workspaceMigration = useWorkspaceMigration(authSession);
    const { theme, resolvedTheme, setTheme } = useTheme();
    const selectedTheme: 'system' | 'light' | 'dark' =
      theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';
    const { phase, isTransitioning, targetEffectiveTheme, runThemeTransition } = useThemeTransition(
      {
        theme: selectedTheme,
        resolvedTheme,
        setTheme,
      },
    );
    const [authMode, setAuthMode] = useState<
      'sign_in' | 'sign_up' | 'forgot_password' | 'reset_password'
    >('sign_in');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [resetPassword, setResetPassword] = useState('');
    const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
    const [userSettingsOpen, setUserSettingsOpen] = useState(false);
    const [resetToken, setResetToken] = useState<string | null>(null);
    const [verifyEmailDialogOpen, setVerifyEmailDialogOpen] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const actionBtnClass =
      'group inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-primary transition-all duration-200 hover:translate-x-0.5 hover:bg-primary/10 hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60';
    const primaryActionBtnClass =
      'group inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60';
    const ghostIconBtnClass =
      'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-60';
    const localeLabel = locale === 'en-US' ? t('locale.enUS') : t('locale.zhCN');
    const themeLabels = {
      system: t('theme.system'),
      light: t('theme.light'),
      dark: t('theme.dark'),
    };
    const userInitials = (
      authSession.name?.trim() ||
      authSession.email?.trim() ||
      t('header.auth.account')
    )
      .slice(0, 2)
      .toUpperCase();
    const themeOverlay =
      phase === 'wipe' || phase === 'fade' ? (
        <div
          aria-hidden
          data-testid="theme-transition-overlay"
          className={`theme-transition-overlay ${
            phase === 'wipe' ? 'theme-transition-overlay--wipe' : 'theme-transition-overlay--fade'
          } ${
            targetEffectiveTheme === 'dark'
              ? 'theme-transition-overlay--to-dark'
              : 'theme-transition-overlay--to-light'
          }`}
        />
      ) : null;

    const clearAuthQuery = () => {
      const nextUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, nextUrl);
    };

    useEffect(() => {
      const query = new URLSearchParams(window.location.search);
      const authAction = query.get('auth_action');
      if (authAction === 'verify-email') {
        void authSession.refreshSession().finally(() => {
          success(t('header.auth.verifyEmailSucceeded'));
          setVerifyEmailDialogOpen(true);
          clearAuthQuery();
        });
        return;
      }

      if (authAction !== 'reset-password') {
        return;
      }

      const token = query.get('token');
      if (!token) {
        error(t('header.auth.resetTokenInvalid'));
        clearAuthQuery();
        return;
      }

      setResetToken(token);
      setAuthMode('reset_password');
      authSession.openAuthDialog();
    }, [authSession, error, success, t]);

    const authDialogDescription = useMemo(() => {
      if (authMode === 'sign_up') return t('header.auth.dialogDescriptionSignUp');
      if (authMode === 'forgot_password') return t('header.auth.dialogDescriptionForgotPassword');
      if (authMode === 'reset_password') return t('header.auth.dialogDescriptionResetPassword');
      return t('header.auth.dialogDescriptionSignIn');
    }, [authMode, t]);

    const handleSubmitAuth = async () => {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        error(t('header.auth.emailRequired'));
        return;
      }

      try {
        setIsSubmittingAuth(true);
        if (authMode === 'sign_in') {
          if (!password.trim()) {
            error(t('header.auth.passwordRequired'));
            return;
          }
          await authSession.signInWithEmail(trimmedEmail, password);
          success(t('header.auth.signedIn'));
          authSession.closeAuthDialog();
          return;
        }

        if (authMode === 'sign_up') {
          if (!name.trim()) {
            error(t('header.auth.nameRequired'));
            return;
          }
          if (!password.trim()) {
            error(t('header.auth.passwordRequired'));
            return;
          }
          if (!turnstileToken) {
            error(t('header.auth.turnstileRequired'));
            return;
          }
          await authSession.signUpWithEmail({
            name: name.trim(),
            email: trimmedEmail,
            password,
            turnstileToken,
          });
          setTurnstileToken(null);
          success(t('header.auth.verifyEmailSent', { email: trimmedEmail }));
          setAuthMode('sign_in');
          setPassword('');
          return;
        }

        if (authMode === 'forgot_password') {
          await authSession.requestPasswordReset(trimmedEmail);
          success(t('header.auth.resetEmailSent', { email: trimmedEmail }));
          setAuthMode('sign_in');
          return;
        }

        if (!resetToken) {
          error(t('header.auth.resetTokenInvalid'));
          return;
        }

        if (!resetPassword.trim()) {
          error(t('header.auth.passwordRequired'));
          return;
        }

        await authSession.resetPassword(resetToken, resetPassword);
        success(t('header.auth.passwordResetSucceeded'));
        setResetPassword('');
        setResetToken(null);
        clearAuthQuery();
        setAuthMode('sign_in');
        authSession.closeAuthDialog();
      } catch (err) {
        error(err instanceof Error ? err.message : t('header.auth.signInFailed'));
      } finally {
        setIsSubmittingAuth(false);
      }
    };

    const handleResendVerification = async () => {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        error(t('header.auth.emailRequired'));
        return;
      }

      try {
        setIsSubmittingAuth(true);
        await authSession.sendVerificationEmail(trimmedEmail);
        success(t('header.auth.verifyEmailSent', { email: trimmedEmail }));
      } catch (err) {
        error(err instanceof Error ? err.message : t('header.auth.signInFailed'));
      } finally {
        setIsSubmittingAuth(false);
      }
    };

    const handleSignOut = async () => {
      try {
        await authSession.signOut();
        success(t('header.auth.signedOut'));
      } catch (err) {
        error(err instanceof Error ? err.message : t('header.auth.signOutFailed'));
      }
    };

    const handleRunWorkspaceMigration = async () => {
      try {
        const result = await workspaceMigration.runMigration();
        if (!result) return;
        success(
          t('header.workspaceMigration.completed', {
            created: result.createdCount,
            copied: result.copiedCount,
            skipped: result.skippedCount,
          }),
        );
      } catch (err) {
        error(err instanceof Error ? err.message : t('header.workspaceMigration.failed'));
      }
    };

    return (
      <>
        {onPlayFireworks ? (
          <style>{`
            @keyframes header-lantern-sway {
              0%, 100% { transform: rotate(-4deg); }
              50% { transform: rotate(4deg); }
            }

            .header-lantern-btn {
              transform-origin: 50% 0%;
              animation: header-lantern-sway 4.8s ease-in-out infinite;
            }

            .header-lantern-btn:hover {
              filter: drop-shadow(0 0 10px hsl(var(--primary)));
            }
          `}</style>
        ) : null}
        <header className="relative border-b bg-card/95 backdrop-blur-sm shadow-sm">
          {/* Decorative gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

          <div className="relative px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="group flex items-center gap-3">
                  <img
                    src="/logo.svg"
                    alt={`${t('header.appName')} Logo`}
                    width={32}
                    height={32}
                    className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="bg-gradient-to-r from-foreground to-primary bg-clip-text text-lg font-bold tracking-tight text-transparent">
                        {t('header.appName')}
                      </h1>
                      {onPlayFireworks ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={t('header.playFireworks')}
                              onClick={onPlayFireworks}
                              className="header-lantern-btn transition-transform duration-300 hover:scale-105"
                            >
                              <svg
                                width="26"
                                height="26"
                                viewBox="0 0 100 100"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                              >
                                <line
                                  x1="50"
                                  y1="0"
                                  x2="50"
                                  y2="15"
                                  stroke="#FFD700"
                                  strokeWidth="2"
                                />
                                <rect x="35" y="15" width="30" height="6" rx="2" fill="#FFD700" />
                                <ellipse cx="50" cy="45" rx="35" ry="28" fill="#D32F2F" />
                                <path
                                  d="M50 17 V 73"
                                  stroke="#B71C1C"
                                  strokeWidth="1"
                                  fill="none"
                                />
                                <path
                                  d="M35 19 Q 25 45 35 71"
                                  stroke="#B71C1C"
                                  strokeWidth="1"
                                  fill="none"
                                />
                                <path
                                  d="M65 19 Q 75 45 65 71"
                                  stroke="#B71C1C"
                                  strokeWidth="1"
                                  fill="none"
                                />
                                <rect x="35" y="70" width="30" height="6" rx="2" fill="#FFD700" />
                                <path d="M50 76 V 85" stroke="#D32F2F" strokeWidth="3" />
                                <path
                                  d="M50 85 Q 45 95 40 98"
                                  stroke="#D32F2F"
                                  strokeWidth="2"
                                  fill="none"
                                />
                                <path
                                  d="M50 85 Q 55 95 60 98"
                                  stroke="#D32F2F"
                                  strokeWidth="2"
                                  fill="none"
                                />
                                <path
                                  d="M50 85 V 100"
                                  stroke="#D32F2F"
                                  strokeWidth="2"
                                  fill="none"
                                />
                                <circle cx="50" cy="45" r="8" fill="#FFD700" opacity="0.8" />
                                <text
                                  x="50"
                                  y="49"
                                  fontSize="10"
                                  textAnchor="middle"
                                  fill="#D32F2F"
                                  fontFamily="serif"
                                  fontWeight="700"
                                >
                                  福
                                </text>
                              </svg>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('header.playFireworks')}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                    <p className="text-xs leading-none text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                      {t('header.appDescription')}
                    </p>
                  </div>
                </div>
                <div className="h-5 w-px shrink-0 bg-border" />
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Suspense
                    fallback={
                      <button type="button" className={primaryActionBtnClass} disabled>
                        <FileInput className="h-4 w-4" aria-hidden />
                        {t('header.importSql')}
                      </button>
                    }
                  >
                    <ImportSqlDialog
                      currentDbType={currentDbType}
                      onImport={onImport}
                      triggerClassName={primaryActionBtnClass}
                      triggerIcon={<FileInput className="h-4 w-4" aria-hidden />}
                      triggerLabel={t('header.importSql')}
                      savedTables={savedTables}
                      folderTree={folderTree}
                      saveTable={saveTable}
                      overwriteTable={overwriteTable}
                      moveTableToFolder={moveTableToFolder}
                      onBatchImportComplete={onBatchImportComplete}
                    />
                  </Suspense>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={onOpenAIGenerate} className={actionBtnClass}>
                        <Sparkles className="h-4 w-4" aria-hidden />
                        {t('tableConfig.aiGenerate')}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('tableConfig.aiGenerateTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={onShare}
                        className={actionBtnClass}
                        disabled={isSharing}
                        aria-busy={isSharing}
                      >
                        {isSharing ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Share2 className="h-4 w-4" aria-hidden />
                        )}
                        {isSharing ? t('header.generatingShareLink') : t('header.shareLink')}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {isSharing
                          ? t('header.generatingShareLink')
                          : t('header.generateShareLink')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                {authSession.status === 'signed_in' ? <WorkspaceYDocStatus /> : null}
                <div className="hidden rounded-full bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground sm:inline-flex">
                  v{packageInfo.version}
                </div>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={ghostIconBtnClass}
                          aria-label={t('header.moreActions')}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('header.moreActions')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="w-52" finalFocus={false}>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Languages className="h-4 w-4" aria-hidden />
                        <span className="min-w-0 flex-1">{t('locale.label')}</span>
                        <span className="text-xs text-muted-foreground">{localeLabel}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-36">
                        <DropdownMenuRadioGroup
                          value={locale}
                          onValueChange={(value) => setLocale(value as AppLocale)}
                        >
                          <DropdownMenuRadioItem value="zh-CN">
                            {t('locale.zhCN')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="en-US">
                            {t('locale.enUS')}
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        {selectedTheme === 'dark' ? (
                          <Moon className="h-4 w-4" aria-hidden />
                        ) : selectedTheme === 'light' ? (
                          <Sun className="h-4 w-4" aria-hidden />
                        ) : (
                          <Laptop className="h-4 w-4" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">{t('theme.label')}</span>
                        <span className="text-xs text-muted-foreground">
                          {themeLabels[selectedTheme]}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-36">
                        <DropdownMenuRadioGroup
                          value={selectedTheme}
                          onValueChange={(value) =>
                            runThemeTransition(value as 'system' | 'light' | 'dark')
                          }
                        >
                          <DropdownMenuRadioItem value="system" disabled={isTransitioning}>
                            {t('theme.system')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="light" disabled={isTransitioning}>
                            {t('theme.light')}
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="dark" disabled={isTransitioning}>
                            {t('theme.dark')}
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <a href={docsUrl} target="_blank" rel="noopener noreferrer">
                        <BookOpen className="h-4 w-4" aria-hidden />
                        {t('header.docs')}
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4" aria-hidden />
                        {t('header.feedback')}
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {authSession.status === 'signed_in' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        title={authSession.name ?? authSession.email ?? t('header.auth.account')}
                      >
                        {userInitials}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        {authSession.name ?? authSession.email ?? t('header.auth.account')}
                      </div>
                      <DropdownMenuItem onClick={() => setUserSettingsOpen(true)}>
                        <Settings className="h-4 w-4" aria-hidden />
                        {t('header.auth.settings')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleSignOut}>
                        <LogOut className="h-4 w-4" aria-hidden />
                        {t('header.auth.signOut')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <button
                    type="button"
                    className={actionBtnClass}
                    onClick={authSession.openAuthDialog}
                    disabled={authSession.status === 'loading'}
                  >
                    {authSession.status === 'loading' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <LogIn className="h-4 w-4" aria-hidden />
                    )}
                    {t('header.auth.signIn')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>
        {themeOverlay && typeof document !== 'undefined'
          ? createPortal(themeOverlay, document.body)
          : null}
        <UserSettingsDialog open={userSettingsOpen} onOpenChange={setUserSettingsOpen} />
        <Dialog
          open={authSession.authDialogOpen}
          onOpenChange={(open) =>
            open ? authSession.openAuthDialog() : authSession.closeAuthDialog()
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('header.auth.dialogTitle')}</DialogTitle>
              <DialogDescription>{authDialogDescription}</DialogDescription>
            </DialogHeader>
            {authMode === 'sign_up' ? (
              <div className="space-y-2">
                <label htmlFor="auth-name" className="text-sm font-medium text-foreground">
                  {t('header.auth.nameLabel')}
                </label>
                <Input
                  id="auth-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('header.auth.namePlaceholder')}
                  autoComplete="name"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="auth-email" className="text-sm font-medium text-foreground">
                {t('header.auth.emailLabel')}
              </label>
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('header.auth.emailPlaceholder')}
                autoComplete="email"
              />
            </div>
            {authMode === 'sign_in' || authMode === 'sign_up' ? (
              <div className="space-y-2">
                <label htmlFor="auth-password" className="text-sm font-medium text-foreground">
                  {t('header.auth.passwordLabel')}
                </label>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('header.auth.passwordPlaceholder')}
                  autoComplete={authMode === 'sign_in' ? 'current-password' : 'new-password'}
                />
              </div>
            ) : null}
            {authMode === 'reset_password' ? (
              <div className="space-y-2">
                <label htmlFor="reset-password" className="text-sm font-medium text-foreground">
                  {t('header.auth.newPasswordLabel')}
                </label>
                <Input
                  id="reset-password"
                  type="password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  placeholder={t('header.auth.passwordPlaceholder')}
                  autoComplete="new-password"
                />
              </div>
            ) : null}
            {authMode === 'sign_up' ? (
              TURNSTILE_SITE_KEY ? (
                <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onTokenChange={setTurnstileToken} />
              ) : (
                <p className="text-sm text-destructive">
                  {t('header.auth.turnstileNotConfigured')}
                </p>
              )
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {authMode !== 'reset_password' ? (
                <button
                  type="button"
                  className="underline-offset-4 hover:underline"
                  onClick={() => {
                    setTurnstileToken(null);
                    setAuthMode(authMode === 'sign_up' ? 'sign_in' : 'sign_up');
                  }}
                >
                  {authMode === 'sign_up'
                    ? t('header.auth.switchToSignIn')
                    : t('header.auth.switchToSignUp')}
                </button>
              ) : null}
              {authMode === 'sign_in' ? (
                <button
                  type="button"
                  className="underline-offset-4 hover:underline"
                  onClick={() => setAuthMode('forgot_password')}
                >
                  {t('header.auth.switchToForgotPassword')}
                </button>
              ) : null}
              {authMode === 'forgot_password' ? (
                <button
                  type="button"
                  className="underline-offset-4 hover:underline"
                  onClick={() => setAuthMode('sign_in')}
                >
                  {t('header.auth.switchBackToSignIn')}
                </button>
              ) : null}
            </div>
            <DialogFooter>
              {authMode === 'sign_in' ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResendVerification}
                  disabled={isSubmittingAuth}
                >
                  <MailCheck className="h-4 w-4" aria-hidden />
                  {t('header.auth.resendVerification')}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={authSession.closeAuthDialog}>
                {t('header.auth.cancel')}
              </Button>
              <Button type="button" onClick={handleSubmitAuth} disabled={isSubmittingAuth}>
                {isSubmittingAuth ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <LogIn className="h-4 w-4" aria-hidden />
                )}
                {authMode === 'sign_up'
                  ? t('header.auth.createAccount')
                  : authMode === 'forgot_password'
                    ? t('header.auth.sendResetPassword')
                    : authMode === 'reset_password'
                      ? t('header.auth.resetPassword')
                      : t('header.auth.signIn')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={verifyEmailDialogOpen} onOpenChange={setVerifyEmailDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('header.auth.verifyEmailDialogTitle')}</DialogTitle>
              <DialogDescription>{t('header.auth.verifyEmailSucceeded')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => setVerifyEmailDialogOpen(false)}>
                {t('header.auth.verifyEmailDialogConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={workspaceMigration.open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              workspaceMigration.dismiss();
              return;
            }
            workspaceMigration.setOpen(nextOpen);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('header.workspaceMigration.title')}</DialogTitle>
              <DialogDescription>
                {workspaceMigration.pending?.result.conflictCount
                  ? t('header.workspaceMigration.descriptionWithConflicts', {
                      conflicts: workspaceMigration.pending.result.conflictCount,
                    })
                  : t('header.workspaceMigration.description')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {t('header.workspaceMigration.summary', {
                  savedTables: workspaceMigration.pending?.payload.snapshot.savedTables.length ?? 0,
                  savedDrafts: workspaceMigration.pending?.payload.snapshot.savedDrafts.length ?? 0,
                  hasGlobalDraft:
                    workspaceMigration.pending?.payload.snapshot.globalDraft ||
                    workspaceMigration.pending?.payload.snapshot.activeSession?.activeState
                      ? t('header.workspaceMigration.yes')
                      : t('header.workspaceMigration.no'),
                })}
              </p>
              {workspaceMigration.pending?.result.conflicts.length ? (
                <p>
                  {t('header.workspaceMigration.conflicts', {
                    names: workspaceMigration.pending.result.conflicts
                      .map((item) => item.displayName)
                      .slice(0, 3)
                      .join('、'),
                  })}
                </p>
              ) : null}
              {workspaceMigration.error ? (
                <p className="text-destructive">{workspaceMigration.error}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={workspaceMigration.dismiss}
                disabled={workspaceMigration.running}
              >
                {t('header.workspaceMigration.later')}
              </Button>
              <Button
                type="button"
                onClick={handleRunWorkspaceMigration}
                disabled={workspaceMigration.running || workspaceMigration.checking}
              >
                {workspaceMigration.running
                  ? t('header.workspaceMigration.running')
                  : workspaceMigration.pending?.result.conflictCount
                    ? t('header.workspaceMigration.runWithCopies')
                    : t('header.workspaceMigration.run')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);
