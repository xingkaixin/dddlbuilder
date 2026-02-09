import { useCallback } from 'react';
import type { PersistedState } from '@/types';
import { reportError } from '@/utils/errorReporter';

type AnalyticsValue = string | number | boolean | null | undefined;

interface UseShareActionParams {
  buildPersistedState: () => PersistedState;
  showToast: (message: string) => void;
  trackEvent: (
    event: string,
    data?: Record<string, AnalyticsValue>,
  ) => Promise<void> | void;
}

export function useShareAction({
  buildPersistedState,
  showToast,
  trackEvent,
}: UseShareActionParams) {
  return useCallback(async () => {
    const currentState = buildPersistedState();
    try {
      const { compressState } = await import('@/utils/share');
      const compressed = compressState(currentState);
      const url = `${window.location.origin}${window.location.pathname}?s=${compressed}`;
      await navigator.clipboard.writeText(url);
      trackEvent('share_link_create');
      showToast('链接已复制到剪贴板');
    } catch (e) {
      reportError(e, {
        scope: 'App',
        action: 'generateShareLink',
      });
      showToast('生成链接失败');
    }
  }, [buildPersistedState, showToast, trackEvent]);
}
