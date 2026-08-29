import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, LogIn, MailCheck } from '@/components/icons';
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
import { useAuthActions, useAuthDialog } from '@/auth/AuthSessionProvider';
import { TurnstileWidget } from '@/auth/TurnstileWidget';
import { useToast } from '@/hooks/useToast';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';

type AuthMode = 'sign_in' | 'sign_up' | 'forgot_password' | 'reset_password';

const clearAuthQuery = () => {
  const nextUrl = `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
};

const readAuthQuery = () => {
  const query = new URLSearchParams(window.location.search);
  return {
    action: query.get('auth_action'),
    token: query.get('token'),
  };
};

export function AuthDialogs() {
  const { t } = useTranslation();
  const { success, error } = useToast();
  const authActions = useAuthActions();
  const authDialog = useAuthDialog();
  const authSession = useMemo(() => ({ ...authActions, ...authDialog }), [authActions, authDialog]);
  const [authQuery] = useState(readAuthQuery);
  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    authQuery.action === 'reset-password' && authQuery.token ? 'reset_password' : 'sign_in',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(() => authQuery.token);
  const [verifyEmailDialogOpen, setVerifyEmailDialogOpen] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    const authAction = authQuery.action;
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

    const token = authQuery.token;
    if (!token) {
      error(t('header.auth.resetTokenInvalid'));
      clearAuthQuery();
      return;
    }

    authSession.openAuthDialog();
  }, [authQuery, authSession, error, success, t]);

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

  return (
    <>
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
              <p className="text-sm text-destructive">{t('header.auth.turnstileNotConfigured')}</p>
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
    </>
  );
}
