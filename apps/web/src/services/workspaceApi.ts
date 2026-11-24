import {
  decodeApiError,
  decodeCurrentWorkspaceResponse,
} from '@ddlbuilder/shared-types/api-contracts';
import type { CurrentWorkspaceResponseWithMeta } from '@ddlbuilder/shared-types/api';
import * as Option from 'effect/Option';
import { ApiError } from '@/services/apiError';

export const fetchCurrentWorkspace = async (
  signal?: AbortSignal,
): Promise<CurrentWorkspaceResponseWithMeta> => {
  const response = await fetch('/api/workspaces', { credentials: 'include', signal });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = decodeApiError(payload);
    throw new ApiError(error.error ?? '工作区获取失败', response.status, error.code);
  }

  const decoded = decodeCurrentWorkspaceResponse(payload);

  if (Option.isNone(decoded)) throw new Error('工作区响应为空');

  return decoded.value;
};
