import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { ShareApiError, createShare } from '@/services/shareService';
import { reportError } from '@/utils/errorReporter';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';
import i18n from '@/i18n';

type ShareLinkCacheRecord = {
  signature: string;
  url: string;
  expiresAt: number;
};

const SHARE_LINK_CACHE_KEY = 'ddlbuilder:share:last:v2';

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
}

export function useShareAction({ buildPersistedState, showToast }: UseShareActionParams) {
  const inFlightRef = useRef(false);
  const createShareMutation = useMutation({
    mutationFn: (state: PersistedState) => createShare(state),
    retry: false,
  });

  const handleShare = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;

    try {
      const currentState = buildPersistedState();
      const signature = buildSchemaStateSignature(currentState);
      const cached = readShareLinkCache();
      const now = Date.now();

      if (
        cached &&
        cached.signature === signature &&
        cached.expiresAt > now &&
        cached.url.length > 0
      ) {
        await navigator.clipboard.writeText(cached.url);
        showToast(i18n.t('services.shareCopiedReused'));
        return;
      }

      const share = await createShareMutation.mutateAsync(currentState);
      await navigator.clipboard.writeText(share.url);
      writeShareLinkCache({
        signature,
        url: share.url,
        expiresAt: now + share.expiresInSeconds * 1000,
      });
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
    }
  }, [buildPersistedState, createShareMutation, showToast]);

  return {
    handleShare,
    isSharing: createShareMutation.isPending,
  };
}
