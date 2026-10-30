import { useReducer, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type AdminLoginProps = {
  onLogin: (password: string) => Promise<void>;
};

type LoginState = { password: string; submitting: boolean };

type LoginEvent =
  | { type: 'passwordChanged'; password: string }
  | { type: 'submitted' }
  | { type: 'settled' };

const initialLoginState: LoginState = { password: '', submitting: false };

function loginReducer(state: LoginState, event: LoginEvent): LoginState {
  switch (event.type) {
    case 'passwordChanged':
      return { ...state, password: event.password };
    case 'submitted':
      return { ...state, submitting: true };
    case 'settled':
      return { ...state, submitting: false };
  }
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const { t } = useTranslation();
  const [{ password, submitting }, dispatch] = useReducer(loginReducer, initialLoginState);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!password.trim()) return;

    dispatch({ type: 'submitted' });

    try {
      await onLogin(password.trim());
    } catch {
      toast.error(t('admin.login.error'));
    } finally {
      dispatch({ type: 'settled' });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm"
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t('admin.login.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.login.subtitle')}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="admin-password" className="text-sm font-medium">
            {t('admin.login.passwordLabel')}
          </label>
          <Input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => dispatch({ type: 'passwordChanged', password: e.target.value })}
            placeholder={t('admin.login.passwordPlaceholder')}
            autoFocus
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting || !password.trim()}>
          {submitting ? '...' : t('admin.login.submit')}
        </Button>
      </form>
    </div>
  );
}
