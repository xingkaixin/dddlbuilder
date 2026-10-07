import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useStorageEstimation } from '@/hooks/useStorageEstimation';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('useStorageEstimation hook', () => {
  const fields: NormalizedField[] = [
    {
      name: 'id',
      type: 'bigint',
      nullable: false,
      comment: '',
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ];

  it('should return initial estimation values', () => {
    const { result } = renderHook(() => useStorageEstimation('mysql', fields));

    expect(result.current.estimateRows).toBe(10000);
    expect(result.current.result.dbName).toBe('MySQL (InnoDB)');
    expect(result.current.totalSizeDisplay.unit).toBe('KB');
  });

  it('should correctly format large sizes', () => {
    const { result } = renderHook(() => useStorageEstimation('mysql', fields));

    act(() => {
      result.current.setEstimateRows(10000000);
    });

    // 10M rows of ~30 bytes should be around 300MB
    expect(result.current.totalSizeDisplay.unit).toBe('MB');
  });

  it('should update result when dbType changes', () => {
    const { result, rerender } = renderHook(
      ({ dbType }: { dbType: Parameters<typeof useStorageEstimation>[0] }) =>
        useStorageEstimation(dbType, fields),
      { initialProps: { dbType: 'mysql' } },
    );

    expect(result.current.result.dbName).toBe('MySQL (InnoDB)');

    rerender({ dbType: 'postgresql' });
    expect(result.current.result.dbName).toBe('PostgreSQL');
  });

  it('should format zero total size when estimated rows is zero', () => {
    const { result } = renderHook(() => useStorageEstimation('mysql', fields));

    act(() => {
      result.current.setEstimateRows(0);
    });

    expect(result.current.totalSizeDisplay).toEqual({ value: 0, unit: 'B' });
  });
});
