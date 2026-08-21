import { queryOptions } from '@tanstack/react-query';
import { getShareState } from '@/services/shareService';

const SHARE_CACHE_GC_TIME_MS = 15 * 60 * 1000;

export const shareQueryKeys = {
  state: (shareId: string) => ['share', shareId] as const,
};

export function shareStateOptions(shareId: string) {
  return queryOptions({
    queryKey: shareQueryKeys.state(shareId),
    queryFn: () => getShareState(shareId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: SHARE_CACHE_GC_TIME_MS,
  });
}
