import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import './index.css';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { appQueryClient } from './lib/queryClient';
import { Toaster } from './components/ui/sonner';
import { LocaleProvider } from './i18n/LocaleContext';
import { AuthSessionProvider } from './auth/AuthSessionProvider';
import { isAdminPath } from './admin/lib/adminPath';
import './i18n';

const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })));

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const isAdmin = isAdminPath();

createRoot(rootElement).render(
  <StrictMode>
    <LocaleProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        storageKey="ddlbuilder:theme:v1"
      >
        <QueryClientProvider client={appQueryClient}>
          <AppErrorBoundary>
            {isAdmin ? (
              <AdminApp />
            ) : (
              <AuthSessionProvider>
                <App />
              </AuthSessionProvider>
            )}
            <Toaster position="top-center" />
          </AppErrorBoundary>
        </QueryClientProvider>
      </ThemeProvider>
    </LocaleProvider>
  </StrictMode>,
);
