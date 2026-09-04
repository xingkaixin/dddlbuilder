import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { getWorkspaceRoot } from '@ddlbuilder/workspace-core';
import { useWorkspaceYDocProjection } from '@/hooks/useWorkspaceYDocProjection';

it('captures updates before subscription and continues observing changes', () => {
  const doc = new Y.Doc();
  const collections = ['folders'] as const;
  const read = (current: Y.Doc) => getWorkspaceRoot(current).folders.size;
  const { result, unmount } = renderHook(() => {
    const count = useWorkspaceYDocProjection(doc, collections, read, 0);
    useLayoutEffect(() => {
      getWorkspaceRoot(doc).folders.set('first', new Y.Map());
    }, []);
    return count;
  });

  expect(result.current).toBe(1);
  act(() => getWorkspaceRoot(doc).folders.set('second', new Y.Map()));
  expect(result.current).toBe(2);
  unmount();
  doc.destroy();
});
