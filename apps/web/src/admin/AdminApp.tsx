import { useState } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminLayout } from './AdminLayout';
import { AdminUserList } from './AdminUserList';
import { AdminUserDetailView } from './AdminUserDetail';
import { useAdminSession } from './hooks/useAdminSession';

type AdminView = { kind: 'list' } | { kind: 'detail'; userId: string };

export function AdminApp() {
  const { isAuthenticated, isLoading, login, logout } = useAdminSession();
  const [view, setView] = useState<AdminView>({ kind: 'list' });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        ...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onLogin={login} />;
  }

  return (
    <AdminLayout onLogout={logout}>
      {view.kind === 'list' ? (
        <AdminUserList onSelectUser={(userId) => setView({ kind: 'detail', userId })} />
      ) : (
        <AdminUserDetailView userId={view.userId} onBack={() => setView({ kind: 'list' })} />
      )}
    </AdminLayout>
  );
}
