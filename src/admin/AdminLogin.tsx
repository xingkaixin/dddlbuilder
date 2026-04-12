import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type AdminLoginProps = {
  onLogin: (password: string) => Promise<void>;
};

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    try {
      await onLogin(password.trim());
    } catch {
      toast.error(t('admin.login.error'));
    } finally {
      setLoading(false);
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
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('admin.login.passwordPlaceholder')}
            autoFocus
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading || !password.trim()}>
          {loading ? '...' : t('admin.login.submit')}
        </Button>
      </form>
    </div>
  );
}
