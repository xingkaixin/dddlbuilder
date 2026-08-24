import { useCallback, useMemo } from 'react';
import { useAuthSession } from '@/auth/AuthSessionProvider';
import i18n from '@/i18n';

export function useAIRequestAccess() {
  const { status, userId, creditsStatus, creditBalance, openAuthDialog, refreshCredits } =
    useAuthSession();

  const getAccessError = useCallback(() => {
    if (status !== 'signed_in' || !userId) {
      openAuthDialog();
      return i18n.t('services.authRequired');
    }
    if (creditsStatus === 'ready' && (creditBalance ?? 0) <= 0) {
      return i18n.t('services.creditExhausted');
    }
    return null;
  }, [creditBalance, creditsStatus, openAuthDialog, status, userId]);

  const resolveRequestError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      const message = error instanceof Error ? error.message || fallbackMessage : fallbackMessage;
      if (message === i18n.t('services.authRequired')) {
        openAuthDialog();
      }
      return message;
    },
    [openAuthDialog],
  );

  const refreshCreditsAfterSuccess = useCallback(() => {
    void refreshCredits();
  }, [refreshCredits]);

  return useMemo(
    () => ({ getAccessError, resolveRequestError, refreshCreditsAfterSuccess }),
    [getAccessError, refreshCreditsAfterSuccess, resolveRequestError],
  );
}
