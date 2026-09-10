import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Loader2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuthActions } from '@/auth/AuthSessionProvider';

type EmailVerificationFormProps = {
  email: string;
  sentAt: number;
  onSent: () => void;
  onVerified: () => void;
  onBack: () => void;
};

export function EmailVerificationForm({
  email,
  sentAt,
  onSent,
  onVerified,
  onBack,
}: EmailVerificationFormProps) {
  const { t } = useTranslation();
  const { verifyEmail, sendVerificationEmail } = useAuthActions();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<'verify' | 'resend' | null>(null);
  const [now, setNow] = useState(Date.now);
  const inputRef = useRef<HTMLInputElement>(null);
  const resendSeconds = Math.max(0, Math.ceil((sentAt + 60_000 - now) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  const handleVerify = async () => {
    if (pending || otp.length !== 6) return;
    setPending('verify');
    setError('');

    try {
      await verifyEmail(email, otp);
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('header.auth.verifyCodeFailed'));
      inputRef.current?.focus();
      inputRef.current?.select();
    } finally {
      setPending(null);
    }
  };

  const handleResend = async () => {
    if (pending || resendSeconds > 0) return;
    setPending('resend');
    setError('');

    try {
      await sendVerificationEmail(email);
      setOtp('');
      setNow(Date.now());
      onSent();
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('header.auth.sendCodeFailed'));
    } finally {
      setPending(null);
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
          onChange={(value) => {
            setOtp(value);
            setError('');
          }}
          readOnly={pending !== null}
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
        <Button type="submit" disabled={pending !== null || otp.length !== 6}>
          {pending === 'verify' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {t('header.auth.verifyCode')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleResend}
          disabled={pending !== null || resendSeconds > 0}
        >
          {pending === 'resend' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {resendSeconds > 0
            ? t('header.auth.resendCodeIn', { count: resendSeconds })
            : t('header.auth.resendVerification')}
        </Button>
        <Button type="button" variant="link" onClick={onBack} disabled={pending !== null}>
          {t('header.auth.switchBackToSignIn')}
        </Button>
      </div>
    </form>
  );
}
