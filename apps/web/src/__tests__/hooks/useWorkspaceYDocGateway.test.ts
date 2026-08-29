import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';

const workspace = vi.hoisted(() => ({ doc: null as Y.Doc | null, localSynced: true }));
vi.mock('@/providers/WorkspaceYDocProvider', () => ({ useWorkspaceYDocDocument: () => workspace }));

describe('local workspace transaction ownership', () => {
  it('assigns the same local origin to every gateway', () => {
    const doc = new Y.Doc();
    workspace.doc = doc;
    const scope = { kind: 'user' as const, userId: 'u', workspaceId: 'w' };
    const first = renderHook(() => useWorkspaceYDocGateway(scope));
    const second = renderHook(() => useWorkspaceYDocGateway(scope));
    const origins: unknown[] = [];
    doc.on('update', (_update, origin) => origins.push(origin));
    first.result.current.runInYDoc((current) => current.getMap('drafts').set('one', 1));
    second.result.current.runInYDoc((current) => current.getMap('drafts').set('two', 2));
    const outcome = first.result.current.runInYDoc(() => 'committed');
    expect(origins).toEqual(['workspace-local-edit', 'workspace-local-edit']);
    expect(outcome).toBe('committed');
    first.unmount();
    second.unmount();
    doc.destroy();
  });
});
