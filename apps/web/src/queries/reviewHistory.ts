import { queryOptions, skipToken } from '@tanstack/react-query';
import { getReview, listReviewMetadata, type ReviewTarget } from '@/utils/reviewHistory';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';

const reviewTargetKey = (target: ReviewTarget | null) =>
  target
    ? [
        getWorkspaceScopeStorageKey(target.scope),
        target.tableId ?? null,
        target.draftId ?? null,
        target.normalizedName,
      ]
    : [null];

export const reviewHistoryQueryKeys = {
  list: (target: ReviewTarget | null) => ['review-history', ...reviewTargetKey(target), 'list'],
  detail: (target: ReviewTarget | null, id: string | null) => [
    'review-history',
    ...reviewTargetKey(target),
    'detail',
    id,
  ],
};

export const reviewListOptions = (target: ReviewTarget | null) =>
  queryOptions({
    queryKey: reviewHistoryQueryKeys.list(target),
    queryFn: target ? () => listReviewMetadata(target) : skipToken,
  });

export const reviewDetailOptions = (target: ReviewTarget | null, id: string | null) =>
  queryOptions({
    queryKey: reviewHistoryQueryKeys.detail(target, id),
    queryFn: target && id ? () => getReview(id, target) : skipToken,
  });
