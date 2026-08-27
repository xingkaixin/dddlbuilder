import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLoadedTablePresentation } from '@/components/App/hooks/useLoadedTablePresentation';

const countTableVersions = vi.fn();

describe('useLoadedTablePresentation', () => {
  it('切换表时不展示上一张表尚未完成的版本查询结果', async () => {
    let resolveAlpha: (count: number) => void = () => {};
    countTableVersions
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveAlpha = resolve;
          }),
      )
      .mockResolvedValueOnce(2);
    const { result, rerender } = renderHook(
      ({ normalizedName, tableName }) =>
        useLoadedTablePresentation({
          hydrated: true,
          isShareView: false,
          normalizedName,
          tableName,
          isDirty: false,
          countTableVersions,
        }),
      { initialProps: { normalizedName: 'alpha', tableName: 'Alpha' } },
    );

    rerender({ normalizedName: 'beta', tableName: 'Beta' });
    expect(result.current.loadedTableVersion).toBe(0);

    await act(async () => resolveAlpha(9));
    expect(result.current.loadedTableVersion).toBe(2);
  });

  it('外部加载结果应关联到指定表名', () => {
    const { result, rerender } = renderHook(
      ({ normalizedName, tableName }) =>
        useLoadedTablePresentation({
          hydrated: false,
          isShareView: false,
          normalizedName,
          tableName,
          isDirty: false,
          countTableVersions,
        }),
      { initialProps: { normalizedName: 'alpha', tableName: 'Alpha' } },
    );

    act(() => result.current.setLoadedTableVersion(4, 'beta'));
    rerender({ normalizedName: 'beta', tableName: 'Beta' });

    expect(result.current.loadedTableVersion).toBe(4);
  });
});
