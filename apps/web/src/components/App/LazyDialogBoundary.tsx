import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { reportError } from '@/utils/errorReporter';
import { i18n } from '@/i18n';

interface DialogErrorBoundaryProps {
  children: ReactNode;
  open: boolean;
  onDismiss: () => void;
}

class DialogErrorBoundary extends Component<DialogErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      scope: 'AppErrorBoundary',
      action: 'renderCrash',
      metadata: {
        variant: 'dialog',
        componentStack: errorInfo.componentStack,
      },
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { open, onDismiss } = this.props;

      return (
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) onDismiss();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{i18n.t('errorBoundary.title')}</DialogTitle>
              <DialogDescription>{i18n.t('errorBoundary.description')}</DialogDescription>
            </DialogHeader>
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
    <DialogErrorBoundary open={open} onDismiss={onDismiss}>
      <Suspense fallback={null}>{children}</Suspense>
    </DialogErrorBoundary>
  );
}
