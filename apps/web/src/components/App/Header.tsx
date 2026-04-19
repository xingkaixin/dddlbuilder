import { memo, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { ParsedResult } from '@/utils/SqlParser';
import packageInfo from '../../../package.json';
import {
  Share2,
  FileInput,
  Loader2,
  BookOpen,
  LogIn,
  User2,
  LogOut,
  MailCheck,
  Settings,
} from 'lucide-react';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LocaleSwitcher } from './LocaleSwitcher';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserSettingsDialog } from './UserSettingsDialog';

const ImportSqlDialog = lazy(() =>
  import('@/components/ImportSqlDialog').then((module) => ({
    default: module.ImportSqlDialog,
  })),
);

interface HeaderProps {
  onShare: () => void;
  isSharing: boolean;
  currentDbType: DatabaseType;
  onImport: (result: ParsedResult, dbType: DatabaseType) => void;
  onPlayFireworks?: () => void;
}

export const Header = memo<HeaderProps>(
  ({ onShare, isSharing, currentDbType, onImport, onPlayFireworks }) => {
    const { t } = useTranslation();
    const { locale } = useLocale();
    const { success, error } = useToast();
    const docsUrl = getDocsUrl(locale);
    const authSession = useAuthSession();
    const workspaceMigration = useWorkspaceMigration(authSession);
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
    const actionBtnClass =
      'group inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-primary transition-all duration-200 hover:translate-x-0.5 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60';

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
          await authSession.signUpWithEmail({
            name: name.trim(),
            email: trimmedEmail,
            password,
          });
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

          <div className="relative px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 group">
                <img
                  src="/logo.svg"
                  alt={`${t('header.appName')} Logo`}
                  width={40}
                  height={40}
                  className="h-10 w-10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent tracking-tight">
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
                              width="30"
                              height="30"
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
                              <path d="M50 17 V 73" stroke="#B71C1C" strokeWidth="1" fill="none" />
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
                              <path d="M50 85 V 100" stroke="#D32F2F" strokeWidth="2" fill="none" />
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
                  <p className="text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                    {t('header.appDescription')}
                  </p>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full inline-block">
                  v{packageInfo.version}
                </div>
                <div className="flex items-center gap-3">
                  <Suspense
                    fallback={
                      <button type="button" className={actionBtnClass} disabled>
                        <FileInput className="h-4 w-4" aria-hidden />
                        {t('header.importSql')}
                      </button>
                    }
                  >
                    <ImportSqlDialog
                      currentDbType={currentDbType}
                      onImport={onImport}
                      triggerClassName={actionBtnClass}
                      triggerIcon={<FileInput className="h-4 w-4" aria-hidden />}
                      triggerLabel={t('header.importSql')}
                    />
                  </Suspense>
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
                  <LocaleSwitcher triggerClassName={actionBtnClass} />
                  <ThemeSwitcher triggerClassName={actionBtnClass} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={docsUrl}
                        className={actionBtnClass}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <BookOpen className="h-4 w-4" aria-hidden />
                        {t('header.docs')}
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('header.viewDocs')}</p>
                    </TooltipContent>
                  </Tooltip>
                  {authSession.status === 'signed_in' ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className={actionBtnClass}>
                          <User2 className="h-4 w-4" aria-hidden />
                          {authSession.name ?? authSession.email ?? t('header.auth.account')}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-48">
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
          </div>
        </header>
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
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {authMode !== 'reset_password' ? (
                <button
                  type="button"
                  className="underline-offset-4 hover:underline"
                  onClick={() => setAuthMode(authMode === 'sign_up' ? 'sign_in' : 'sign_up')}
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
