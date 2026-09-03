import { useCallback, useRef, useState } from 'react';

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

export const useAuthCallbackCommand = () => {
  const [command, setCommand] = useState(readAuthCallbackCommand);
  const consumedRef = useRef(false);
  const initialResetToken = command?.type === 'reset-password' ? command.token : null;

  const consume = useCallback(() => {
    if (consumedRef.current || !command) return null;

    consumedRef.current = true;
    setCommand(null);
    clearAuthCallbackQuery();
    return command;
  }, [command]);

  return { initialResetToken, consume };
};
