import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { reportError } from '@/utils/errorReporter';
import { i18n } from '@/i18n';

type AppErrorBoundaryProps = { children: ReactNode } & (
  | { variant?: 'page' | 'section' }
  | { variant: 'dialog'; onDismiss: () => void; open: boolean }
);

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
      const { variant } = this.props;

      if (this.props.variant === 'dialog') {
        const { open, onDismiss } = this.props;

        return (
          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) onDismiss();
            }}
          >
            <DialogContent className="max-w-md">
              <DialogTitle>{i18n.t('errorBoundary.title')}</DialogTitle>
              <DialogDescription>{i18n.t('errorBoundary.description')}</DialogDescription>
              <DialogFooter>
                <Button variant="outline" onClick={onDismiss}>
                  {i18n.t('common.cancel')}
                </Button>
                <Button onClick={this.handleReload}>{i18n.t('errorBoundary.reload')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      }

      if (variant === 'section') {
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

export function LazyDialogBoundary({
  children,
  open = true,
  onDismiss,
}: {
  children: ReactNode;
  open?: boolean;
  onDismiss: () => void;
}) {
  return (
    <AppErrorBoundary variant="dialog" open={open} onDismiss={onDismiss}>
      <Suspense fallback={null}>{children}</Suspense>
    </AppErrorBoundary>
  );
}
