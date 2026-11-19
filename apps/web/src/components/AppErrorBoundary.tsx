import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/utils/errorReporter';
import { i18n } from '@/i18n';

interface AppErrorBoundaryProps {
  children: ReactNode;
  variant?: 'page' | 'section' | 'dialog';
  resetKey?: string;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  prevResetKey?: string;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    prevResetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(
    props: AppErrorBoundaryProps,
    state: AppErrorBoundaryState,
  ): Partial<AppErrorBoundaryState> | null {
    if (props.resetKey !== state.prevResetKey) {
      return {
        hasError: false,
        prevResetKey: props.resetKey,
      };
    }

    return null;
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

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const variant = this.props.variant ?? 'page';

      if (variant === 'dialog') {
        return (
          <div
            role="alertdialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          >
            <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg border bg-background p-6 text-center shadow-lg">
              <h2 className="text-lg font-semibold">{i18n.t('errorBoundary.title')}</h2>
              <p className="text-sm text-muted-foreground">{i18n.t('errorBoundary.description')}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={this.handleReset}>
                  {i18n.t('common.cancel')}
                </Button>
                <Button onClick={this.handleReload}>{i18n.t('errorBoundary.reload')}</Button>
              </div>
            </div>
          </div>
        );
      }

      if (variant === 'section') {
        return (
          <div className="flex min-h-[16rem] flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <h2 className="text-xl font-semibold">{i18n.t('errorBoundary.title')}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {i18n.t('errorBoundary.description')}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={this.handleReset}>
                {i18n.t('common.retry')}
              </Button>
              <Button onClick={this.handleReload}>{i18n.t('errorBoundary.reload')}</Button>
            </div>
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
