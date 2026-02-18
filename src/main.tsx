import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { ThemeProvider } from 'next-themes';
import './index.css';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { appQueryClient } from './lib/queryClient';
import { Toaster } from './components/ui/sonner';
import { LocaleProvider } from './i18n/LocaleContext';
import './i18n';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

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
            <App />
            <Toaster position="top-center" />
          </AppErrorBoundary>
          <Analytics />
          <SpeedInsights />
        </QueryClientProvider>
      </ThemeProvider>
    </LocaleProvider>
  </StrictMode>,
);
