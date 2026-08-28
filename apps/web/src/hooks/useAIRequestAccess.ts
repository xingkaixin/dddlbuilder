import { useCallback, useMemo } from 'react';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import { useTranslation } from 'react-i18next';

export function useAIRequestAccess() {
  const { t } = useTranslation();
  const { status, userId, creditsStatus, creditBalance, openAuthDialog, refreshCredits } =
    useAuthSession();

  const authenticated = status === 'signed_in' && Boolean(userId);
  const accessError = !authenticated
    ? t('services.authRequired')
    : creditsStatus === 'ready' && (creditBalance ?? 0) <= 0
      ? t('services.creditExhausted')
      : null;
  const getAccessError = useCallback(() => {
    if (!authenticated) openAuthDialog();
    return accessError;
  }, [accessError, authenticated, openAuthDialog]);

  const resolveRequestError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      const message = error instanceof Error ? error.message || fallbackMessage : fallbackMessage;
      if (message === t('services.authRequired')) {
        openAuthDialog();
      }
      return message;
    },
    [openAuthDialog, t],
  );

  const refreshCreditsAfterSuccess = useCallback(() => {
    void refreshCredits();
  }, [refreshCredits]);

  return useMemo(
    () => ({ accessError, getAccessError, resolveRequestError, refreshCreditsAfterSuccess }),
    [accessError, getAccessError, refreshCreditsAfterSuccess, resolveRequestError],
  );
}
