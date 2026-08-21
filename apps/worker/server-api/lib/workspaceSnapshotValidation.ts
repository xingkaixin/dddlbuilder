import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { decodeWorkspaceSnapshot } from '@ddlbuilder/workspace-core';

export { decodeWorkspaceSnapshot };

export const isWorkspaceSnapshot = (value: unknown): value is WorkspaceSnapshot =>
  decodeWorkspaceSnapshot(value) !== null;
