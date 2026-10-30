import { useReducer } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminLayout } from './AdminLayout';
import { AdminUserList } from './AdminUserList';
import { AdminUserDetailView } from './AdminUserDetail';
import { useAdminSession } from './hooks/useAdminSession';

type AdminView = { kind: 'list' } | { kind: 'detail'; userId: string };

type AdminNavigation = { view: AdminView; userListOffset: number };

type AdminNavigationEvent =
  | { type: 'userSelected'; userId: string }
  | { type: 'backToList' }
  | { type: 'userListPaged'; offset: number };

const initialNavigation: AdminNavigation = { view: { kind: 'list' }, userListOffset: 0 };

function navigationReducer(state: AdminNavigation, event: AdminNavigationEvent): AdminNavigation {
  switch (event.type) {
    case 'userSelected':
      return { ...state, view: { kind: 'detail', userId: event.userId } };
    case 'backToList':
      return { ...state, view: { kind: 'list' } };
    case 'userListPaged':
      return { ...state, userListOffset: event.offset };
  }
}

export function AdminApp() {
  const { isAuthenticated, isLoading, login, logout } = useAdminSession();
  const [{ view, userListOffset }, dispatch] = useReducer(navigationReducer, initialNavigation);

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
        <AdminUserList
          offset={userListOffset}
          onOffsetChange={(offset) => dispatch({ type: 'userListPaged', offset })}
          onSelectUser={(userId) => dispatch({ type: 'userSelected', userId })}
        />
      ) : (
        <AdminUserDetailView userId={view.userId} onBack={() => dispatch({ type: 'backToList' })} />
      )}
    </AdminLayout>
  );
}
