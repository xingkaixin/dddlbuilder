import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@/__tests__/utils/test-utils';
import { useWorkspaceTreeControls } from '@/components/App/saved-tables/useWorkspaceTreeControls';
import type { FolderTreeNode } from '@/hooks/useFolders';

describe('workspace folder expansion', () => {
  it('expands asynchronously loaded folders and keeps explicit collapses', () => {
    const folder = (id: string): FolderTreeNode => ({
      id,
      name: id,
      children: [],
      createdAt: 1,
      updatedAt: 1,
    });
    const { result, rerender } = renderHook(
      ({ folders }: { folders: FolderTreeNode[] }) =>
        useWorkspaceTreeControls({ items: [], folders }),
      { initialProps: { folders: [] } },
    );
    rerender({ folders: [folder('first')] });
    expect(result.current.expandedFolders.has('first')).toBe(true);
    act(() => result.current.toggleFolder('first'));
    rerender({ folders: [folder('first'), folder('second')] });
    expect(result.current.expandedFolders.has('first')).toBe(false);
    expect(result.current.expandedFolders.has('second')).toBe(true);
  });
});
