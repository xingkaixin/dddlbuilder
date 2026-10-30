import { useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Loader2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuthActions } from '@/auth/AuthSessionProvider';
import { useInterval } from '@/hooks/useInterval';

type EmailVerificationFormProps = {
  email: string;
  sentAt: number;
  onSent: () => void;
  onVerified: () => void;
  onBack: () => void;
};

type VerificationState = {
  otp: string;
  now: number;
  request:
    | { status: 'idle' }
    | { status: 'verifying' }
    | { status: 'resending' }
    | { status: 'failed'; error: string };
};

type VerificationEvent =
  | { type: 'otpChanged'; otp: string }
  | { type: 'ticked'; now: number }
  | { type: 'verifyStarted' }
  | { type: 'verified' }
  | { type: 'resendStarted' }
  | { type: 'resent'; now: number }
  | { type: 'failed'; error: string };

const createVerificationState = (): VerificationState => ({
  otp: '',
  now: Date.now(),
  request: { status: 'idle' },
});

function verificationReducer(
  state: VerificationState,
  event: VerificationEvent,
): VerificationState {
  switch (event.type) {
    case 'otpChanged':
      return {
        ...state,
        otp: event.otp,
        request: state.request.status === 'failed' ? { status: 'idle' } : state.request,
      };
    case 'ticked':
      return { ...state, now: event.now };
    case 'verifyStarted':
      return { ...state, request: { status: 'verifying' } };
    case 'verified':
      return { ...state, request: { status: 'idle' } };
    case 'resendStarted':
      return { ...state, request: { status: 'resending' } };
    case 'resent':
      return { ...state, otp: '', now: event.now, request: { status: 'idle' } };
    case 'failed':
      return { ...state, request: { status: 'failed', error: event.error } };
  }
}

export function EmailVerificationForm({
  email,
  sentAt,
  onSent,
  onVerified,
  onBack,
}: EmailVerificationFormProps) {
  const { t } = useTranslation();
  const { verifyEmail, sendVerificationEmail } = useAuthActions();

  const [{ otp, now, request }, dispatch] = useReducer(
    verificationReducer,
    undefined,
    createVerificationState,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = request.status === 'verifying' || request.status === 'resending';
  const error = request.status === 'failed' ? request.error : '';
  const resendSeconds = Math.max(0, Math.ceil((sentAt + 60_000 - now) / 1000));

  useInterval(() => dispatch({ type: 'ticked', now: Date.now() }), 1000);

  const handleVerify = async () => {
    if (pending || otp.length !== 6) return;
    dispatch({ type: 'verifyStarted' });

    try {
      await verifyEmail(email, otp);
      dispatch({ type: 'verified' });
      onVerified();
    } catch (err) {
      dispatch({
        type: 'failed',
        error: err instanceof Error ? err.message : t('header.auth.verifyCodeFailed'),
      });
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const handleResend = async () => {
    if (pending || resendSeconds > 0) return;
    dispatch({ type: 'resendStarted' });

    try {
      await sendVerificationEmail(email);
      dispatch({ type: 'resent', now: Date.now() });
      onSent();
      inputRef.current?.focus();
    } catch (err) {
      dispatch({
        type: 'failed',
        error: err instanceof Error ? err.message : t('header.auth.sendCodeFailed'),
      });
    }
  };

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void handleVerify();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('header.auth.verifyCodeTitle')}</DialogTitle>
        <DialogDescription className="break-words">
          {t('header.auth.verifyCodeDescription', { email })}
        </DialogDescription>
      </DialogHeader>
      <div className="grid justify-items-center gap-3">
        <label htmlFor="auth-otp" className="text-sm font-medium">
          {t('header.auth.otpLabel')}
        </label>
        <InputOTP
          ref={inputRef}
          id="auth-otp"
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={otp}
          onChange={(value) => dispatch({ type: 'otpChanged', otp: value })}
          readOnly={pending}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'auth-otp-error' : 'auth-otp-hint'}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot
                key={index}
                index={index}
                className="size-11 text-lg"
                aria-invalid={Boolean(error)}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <p id="auth-otp-hint" className="text-xs text-muted-foreground">
          {t('header.auth.otpHint')}
        </p>
        {error && (
          <p id="auth-otp-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Button type="submit" disabled={pending || otp.length !== 6}>
          {request.status === 'verifying' && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {t('header.auth.verifyCode')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleResend}
          disabled={pending || resendSeconds > 0}
        >
          {request.status === 'resending' && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {resendSeconds > 0
            ? t('header.auth.resendCodeIn', { count: resendSeconds })
            : t('header.auth.resendVerification')}
        </Button>
        <Button type="button" variant="link" onClick={onBack} disabled={pending}>
          {t('header.auth.switchBackToSignIn')}
        </Button>
      </div>
    </form>
  );
}
