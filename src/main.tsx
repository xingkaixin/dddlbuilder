import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './index.css';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { appQueryClient } from './lib/queryClient';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={appQueryClient}>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
      <Analytics />
      <SpeedInsights />
    </QueryClientProvider>
  </StrictMode>,
);
