import { useCallback, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import i18n from '@/i18n';

type AuthCallbackCommand =
  | { type: 'verify-email' }
  | { type: 'reset-password'; token: string | null };

const readAuthCallbackCommand = (): AuthCallbackCommand | null => {
  const query = new URLSearchParams(window.location.search);
  const action = query.get('auth_action');

  if (action === 'verify-email') return { type: 'verify-email' };

  if (action === 'reset-password') {
    return { type: 'reset-password', token: query.get('token') };
  }

  return null;
};

const clearAuthCallbackQuery = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_action');
  url.searchParams.delete('token');
  window.history.replaceState(
    window.history.state,
    document.title,
    `${url.pathname}${url.search}${url.hash}`,
  );
};

export const notifyAuthCallbackError = () => {
  if (new URLSearchParams(window.location.search).get('error')) {
    toast.error(i18n.t('header.auth.verifyEmailFailed'));
  }
};

const commandReducer = (_command: AuthCallbackCommand | null, _event: 'consumed') => null;

export const useAuthCallbackCommand = () => {
  const [command, dispatch] = useReducer(commandReducer, null, readAuthCallbackCommand);
  const consumedRef = useRef(false);
  const initialResetToken = command?.type === 'reset-password' ? command.token : null;

  const consume = useCallback(() => {
    if (consumedRef.current || !command) return null;

    consumedRef.current = true;
    dispatch('consumed');
    clearAuthCallbackQuery();

    return command;
  }, [command]);

  return { initialResetToken, consume };
};
