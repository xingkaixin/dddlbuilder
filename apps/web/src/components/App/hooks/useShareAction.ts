import { useCallback, useRef, useState } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { ShareApiError, createShare } from '@/services/shareService';
import { reportError } from '@/utils/errorReporter';
import i18n from '@/i18n';

type AnalyticsValue = string | number | boolean | null | undefined;
type ShareLinkCacheRecord = {
  signature: string;
  url: string;
  expiresAt: number;
};

const SHARE_LINK_CACHE_KEY = 'ddlbuilder:share:last:v1';

const hashString = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const buildStateSignature = (state: PersistedState): string => {
  const json = JSON.stringify(state);
  return `v1:${json.length}:${hashString(json)}`;
};

const readShareLinkCache = (): ShareLinkCacheRecord | null => {
  try {
    const raw = localStorage.getItem(SHARE_LINK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShareLinkCacheRecord>;
    if (
      typeof parsed.signature !== 'string' ||
      typeof parsed.url !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    return {
      signature: parsed.signature,
      url: parsed.url,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
};

const writeShareLinkCache = (record: ShareLinkCacheRecord) => {
  try {
    localStorage.setItem(SHARE_LINK_CACHE_KEY, JSON.stringify(record));
  } catch {
    // ignore localStorage quota errors
  }
};

interface UseShareActionParams {
  buildPersistedState: () => PersistedState;
  showToast: (message: string) => void;
  trackEvent: (event: string, data?: Record<string, AnalyticsValue>) => Promise<void> | void;
}

export function useShareAction({
  buildPersistedState,
  showToast,
  trackEvent,
}: UseShareActionParams) {
  const [isSharing, setIsSharing] = useState(false);
  const inFlightRef = useRef(false);

  const handleShare = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setIsSharing(true);

    try {
      const currentState = buildPersistedState();
      const signature = buildStateSignature(currentState);
      const cached = readShareLinkCache();
      const now = Date.now();

      if (
        cached &&
        cached.signature === signature &&
        cached.expiresAt > now &&
        cached.url.length > 0
      ) {
        await navigator.clipboard.writeText(cached.url);
        void trackEvent('share_link_reuse');
        showToast(i18n.t('services.shareCopiedReused'));
        return;
      }

      const share = await createShare(currentState);
      await navigator.clipboard.writeText(share.url);
      writeShareLinkCache({
        signature,
        url: share.url,
        expiresAt: now + share.expiresInSeconds * 1000,
      });
      void trackEvent('share_link_create');
      showToast(i18n.t('services.shareCopied'));
    } catch (e) {
      reportError(e, {
        scope: 'App',
        action: 'generateShareLink',
      });
      if (e instanceof ShareApiError && e.code === 'REDIS_CONFIG_MISSING') {
        showToast(i18n.t('services.shareRedisMissing'));
        return;
      }
      showToast(i18n.t('services.shareCreateFailed'));
    } finally {
      inFlightRef.current = false;
      setIsSharing(false);
    }
  }, [buildPersistedState, showToast, trackEvent]);

  return {
    handleShare,
    isSharing,
  };
}
