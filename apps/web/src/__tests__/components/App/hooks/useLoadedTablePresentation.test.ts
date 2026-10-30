import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLoadedTablePresentation } from '@/components/App/hooks/useLoadedTablePresentation';
import i18n from '@/i18n';
import { createQueryClientWrapper } from '../../../utils/queryClient';

const versionLabel = (name: string, version: number) =>
  i18n.t('app.workspace.currentTable', {
    name,
    version: i18n.t('app.workspace.version', { version }),
    dirty: '',
  });

describe('useLoadedTablePresentation', () => {
  it('切换表时不展示上一张表尚未完成的版本查询结果', async () => {
    let resolveAlpha: (count: number) => void = () => {};

    const countTableVersions = vi
      .fn<() => Promise<number>>()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveAlpha = resolve;
          }),
      )
      .mockResolvedValueOnce(2);
    const { wrapper } = createQueryClientWrapper();

    const { result, rerender } = renderHook(
      ({ normalizedName, tableName }) =>
        useLoadedTablePresentation({
          hydrated: true,
          isShareView: false,
          workspaceScope: { kind: 'anonymous' },
          normalizedName,
          tableName,
          isDirty: false,
          countTableVersions,
        }),
      { initialProps: { normalizedName: 'alpha', tableName: 'Alpha' }, wrapper },
    );

    rerender({ normalizedName: 'beta', tableName: 'Beta' });
    await act(async () => resolveAlpha(9));

    await waitFor(() => expect(result.current.workspaceLabel).toBe(versionLabel('Beta', 2)));
  });
});
