import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { ShareApiError, createShare } from '@/services/shareService';
import { reportError } from '@/utils/errorReporter';
import { writeLocalStorageJson } from '@/utils/localStorage';
import { buildSchemaStateSignature } from '@ddlbuilder/workspace-core';
import { i18n } from '@/i18n';

const ShareLinkCacheRecordSchema = Schema.Struct({
  signature: Schema.String,
  url: Schema.String,
  expiresAt: Schema.Finite,
});

type ShareLinkCacheRecord = typeof ShareLinkCacheRecordSchema.Type;

const decodeShareLinkCache = Schema.decodeUnknownOption(
  Schema.fromJsonString(ShareLinkCacheRecordSchema),
);

const SHARE_LINK_CACHE_KEY = 'ddlbuilder:share:last:v2';

const readShareLinkCache = (): ShareLinkCacheRecord | null => {
  try {
    const raw = localStorage.getItem(SHARE_LINK_CACHE_KEY);

    if (!raw) return null;

    return Option.getOrNull(decodeShareLinkCache(raw));
  } catch {
    return null;
  }
};

const writeShareLinkCache = (record: ShareLinkCacheRecord) => {
  writeLocalStorageJson(SHARE_LINK_CACHE_KEY, record, '[share] share link cache write');
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
