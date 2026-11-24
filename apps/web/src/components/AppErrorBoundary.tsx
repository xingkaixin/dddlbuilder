import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/utils/errorReporter';
import { i18n } from '@/i18n';

interface AppErrorBoundaryProps {
  children: ReactNode;
  variant?: 'page' | 'section';
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      scope: 'AppErrorBoundary',
      action: 'renderCrash',
      metadata: {
        variant: this.props.variant ?? 'page',
        componentStack: errorInfo.componentStack,
      },
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.variant === 'section') {
        return (
          <div className="flex min-h-[16rem] flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <h2 className="text-xl font-semibold">{i18n.t('errorBoundary.title')}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {i18n.t('errorBoundary.description')}
            </p>
            <Button onClick={this.handleReload}>{i18n.t('errorBoundary.reload')}</Button>
          </div>
        );
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-semibold">{i18n.t('errorBoundary.title')}</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {i18n.t('errorBoundary.description')}
          </p>
          <Button onClick={this.handleReload}>{i18n.t('errorBoundary.reload')}</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
