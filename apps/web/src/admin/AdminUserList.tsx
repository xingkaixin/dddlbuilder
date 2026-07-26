import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { listUsers, type AdminUserSummary } from './lib/adminApi';
import { Button } from '@/components/ui/button';
import { Eye } from '@/components/icons';

type AdminUserListProps = {
  onSelectUser: (userId: string) => void;
};

const PAGE_SIZE = 50;

export function AdminUserList({ onSelectUser }: AdminUserListProps) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers(PAGE_SIZE, 0);
      setUsers(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchUsers}>
          {t('common.retry', '重试')}
        </Button>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">{t('admin.users.noUsers')}</div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('admin.users.title')}</h2>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">{t('admin.users.name')}</th>
              <th className="px-4 py-3 text-left font-medium">{t('admin.users.email')}</th>
              <th className="px-4 py-3 text-center font-medium">{t('admin.users.verified')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('admin.users.balance')}</th>
              <th className="px-4 py-3 text-left font-medium">{t('admin.users.createdAt')}</th>
              <th className="px-4 py-3 text-center font-medium">{t('admin.users.status')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('admin.users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3">{user.name || '-'}</td>
                <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
                <td className="px-4 py-3 text-center">{user.emailVerified ? '✓' : '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{user.balance}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-center">
                  {user.disabled ? (
                    <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                      {t('admin.users.disabled')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600 dark:text-green-400">
                      {t('admin.users.active')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => onSelectUser(user.id)}>
                    <Eye className="mr-1 h-4 w-4" />
                    {t('admin.users.viewDetail')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
