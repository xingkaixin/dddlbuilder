import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LogOut } from '@/components/icons';

type AdminLayoutProps = {
  onLogout: () => Promise<void>;
  children: React.ReactNode;
};

export function AdminLayout({ onLogout, children }: AdminLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{t('admin.header.title')}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="mr-1.5 h-4 w-4" />
            {t('admin.header.logout')}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
