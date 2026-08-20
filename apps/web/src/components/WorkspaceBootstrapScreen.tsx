import { useTranslation } from 'react-i18next';
import { MainWorkspaceSkeleton } from '@/components/App/MainWorkspaceSkeleton';
import { Button } from '@/components/ui/button';

type WorkspaceBootstrapScreenProps = {
  failed: boolean;
  onRetry: () => void;
};

/** 写入目标分区确定之前替代整个 App 的整页状态，确保窗口期没有任何可点击的写入入口。 */
export function WorkspaceBootstrapScreen({ failed, onRetry }: WorkspaceBootstrapScreenProps) {
  const { t } = useTranslation();

  if (failed) {
    return (
      <div
        data-testid="workspace-bootstrap-error"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground"
      >
        <h1 className="text-2xl font-semibold">{t('workspaceYDoc.bootstrap.errorTitle')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('workspaceYDoc.bootstrap.errorDescription')}
        </p>
        <Button onClick={onRetry}>{t('workspaceYDoc.bootstrap.retry')}</Button>
      </div>
    );
  }

  return (
    <div
      data-testid="workspace-bootstrap-loading"
      className="min-h-screen bg-background p-3 text-foreground sm:p-4"
    >
      <MainWorkspaceSkeleton />
    </div>
  );
}
