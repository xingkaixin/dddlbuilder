import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Eye } from '@/components/icons';
import { adminUsersOptions } from '@/queries/admin';

type AdminUserListProps = {
  offset: number;
  onOffsetChange: (offset: number) => void;
  onSelectUser: (userId: string) => void;
};

const PAGE_SIZE = 50;

export function AdminUserList({ offset, onOffsetChange, onSelectUser }: AdminUserListProps) {
  const { t } = useTranslation();
  // 多取一条，只用来判断是否还有下一页。
  const usersQuery = useQuery(adminUsersOptions(PAGE_SIZE + 1, offset));

  if (usersQuery.isPending) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">...</div>;
  }

  if (usersQuery.isError) {
    const message =
      usersQuery.error instanceof Error ? usersQuery.error.message : 'Failed to load users';

    return (
      <div className="text-center py-20">
        <p className="text-destructive">{message}</p>
        <Button variant="outline" className="mt-4" onClick={() => void usersQuery.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (usersQuery.data.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">{t('admin.users.noUsers')}</div>
    );
  }

  const users = usersQuery.data.slice(0, PAGE_SIZE);
  const hasNextPage = usersQuery.data.length > PAGE_SIZE;

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

      {offset > 0 || hasNextPage ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={offset === 0}
            onClick={() => onOffsetChange(Math.max(0, offset - PAGE_SIZE))}
            aria-label={t('settings.previousPage')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={!hasNextPage}
            onClick={() => onOffsetChange(offset + PAGE_SIZE)}
            aria-label={t('settings.nextPage')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
