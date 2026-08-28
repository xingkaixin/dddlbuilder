import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import type { PersistenceFailure } from '@/hooks/workspacePersistence/usePersistenceQueue';
import { SHARE_COPY_SAVED_TOAST_KEY } from './useSavedTableTabIntegration';

interface UseWorkspaceNotificationsParams {
  hydrated: boolean;
  isShareView: boolean;
  persistenceFailure: PersistenceFailure | null;
  retryPersistence: () => void;
}

export function useWorkspaceNotifications({
  hydrated,
  isShareView,
  persistenceFailure,
  retryPersistence,
}: UseWorkspaceNotificationsParams) {
  const { t } = useTranslation();
  const { showToast, error: showErrorToast } = useToast();

  useEffect(() => {
    if (!hydrated || !isShareView) return;
    showToast(t('app.shareReadOnly'));
  }, [hydrated, isShareView, showToast, t]);

  useEffect(() => {
    if (isShareView) return;
    try {
      const savedCopyName = sessionStorage.getItem(SHARE_COPY_SAVED_TOAST_KEY);
      if (!savedCopyName) return;
      sessionStorage.removeItem(SHARE_COPY_SAVED_TOAST_KEY);
      showToast(t('app.shareCopySaved', { name: savedCopyName }));
    } catch {
      return;
    }
  }, [isShareView, showToast, t]);

  useEffect(() => {
    if (!persistenceFailure) return;
    showErrorToast(t('app.persistenceFailed'), {
      id: 'workspace-persistence-failure',
      action: {
        label: t('app.retryPersistence'),
        onClick: retryPersistence,
      },
    });
  }, [persistenceFailure, retryPersistence, showErrorToast, t]);
}
