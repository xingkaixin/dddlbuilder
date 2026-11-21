import { lazy, StrictMode, Suspense, type ComponentType, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { syncPreferencesToDocument } from './stores/preferencesStore';
import './index.css';
import './assets/fonts/roboto-mono/fonts.css';
import './assets/fonts/xiaolai/fonts.css';
import './assets/fonts/klee-one/fonts.css';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { appQueryClient } from './lib/queryClient';
import { Toaster } from './components/ui/sonner';
import { LocaleProvider } from './i18n/LocaleContext';
import { AuthSessionProvider } from './auth/AuthSessionProvider';
import { isAdminPath } from './admin/lib/adminPath';
import { listenForCommandShortcut } from './lib/commandShortcut';
import { notifyAuthCallbackError } from './auth/useAuthCallbackCommand';
import { i18n, i18nReady } from './i18n';

const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })));
const WorkspaceShell = lazy(() =>
  import('./components/App/WorkspaceShell').then((m) => ({ default: m.WorkspaceShell })),
);
// SAFETY: next-themes ThemeProvider props omit React 19 children compatibility under this tsconfig.
const AppThemeProvider = ThemeProvider as ComponentType<
  PropsWithChildren<React.ComponentProps<typeof ThemeProvider>>
>;

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const isAdmin = isAdminPath();

if (!isAdmin) void i18nReady.then(notifyAuthCallbackError);

const publicationId = /^\/publications\/([a-zA-Z0-9-]+)\/?$/.exec(location.pathname)?.[1];
const PublicationPage = lazy(() =>
  import('./components/publications/PublicationPage').then((m) => ({ default: m.PublicationPage })),
);

if (!isAdmin && !publicationId) {
  document.documentElement.dataset.surface = 'app';
  syncPreferencesToDocument();
  listenForCommandShortcut();
}

// Keep remote font CSS non-blocking until it has loaded.
const fontStylesheet = document.querySelector<HTMLLinkElement>('#misans-font');

if (fontStylesheet) {
  const enableFont = () => {
    fontStylesheet.media = 'all';
  };

  if (fontStylesheet.sheet) enableFont();
  else fontStylesheet.addEventListener('load', enableFont, { once: true });
}

const renderApp = () => {
  const loadingFallback = (
    <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
      {i18n.isInitialized ? (
        i18n.t('schemaTools.loading')
      ) : (
        <progress aria-label={document.title} />
      )}
    </div>
  );

  createRoot(rootElement).render(
    <StrictMode>
      <LocaleProvider>
        <AppThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="ddlbuilder:theme:v1"
        >
          <QueryClientProvider client={appQueryClient}>
            <AppErrorBoundary>
              {isAdmin ? (
                <Suspense fallback={loadingFallback}>
                  <AdminApp />
                </Suspense>
              ) : (
                <AuthSessionProvider>
                  {publicationId ? (
                    <Suspense fallback={loadingFallback}>
                      <PublicationPage id={publicationId} />
                    </Suspense>
                  ) : (
                    <Suspense fallback={loadingFallback}>
                      <WorkspaceShell />
                    </Suspense>
                  )}
                </AuthSessionProvider>
              )}
              <Toaster />
            </AppErrorBoundary>
          </QueryClientProvider>
        </AppThemeProvider>
      </LocaleProvider>
    </StrictMode>,
  );
};

renderApp();
