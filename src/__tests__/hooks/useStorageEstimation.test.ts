import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useStorageEstimation } from '@/hooks/useStorageEstimation';
import type { NormalizedField } from '@/types';

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
    expect(result.current.rowSizeFormatted).toContain('B');
    expect(result.current.totalSizeFormatted).toContain('KB');
  });

  it('should correctly format large sizes', () => {
    const { result } = renderHook(() => useStorageEstimation('mysql', fields));

    act(() => {
      result.current.setEstimateRows(10000000);
    });

    // 10M rows of ~30 bytes should be around 300MB
    expect(result.current.totalSizeFormatted).toContain('MB');
  });

  it('should update result when dbType changes', () => {
    const { result, rerender } = renderHook(
      ({ dbType }) => useStorageEstimation(dbType, fields),
      {
        initialProps: { dbType: 'mysql' as any },
      },
    );

    expect(result.current.result.dbName).toBe('MySQL (InnoDB)');

    rerender({ dbType: 'postgresql' as any });
    expect(result.current.result.dbName).toBe('PostgreSQL');
  });

  it('should handle baseline overhead for empty fields', () => {
    const { result } = renderHook(() => useStorageEstimation('mysql', []));
    // MySQL InnoDB has 18 bytes baseline overhead (header + TRX_ID + ROLL_PTR)
    expect(result.current.rowSizeFormatted).toBe('18 B');
  });

  it('should format zero total size when estimated rows is zero', () => {
    const { result } = renderHook(() => useStorageEstimation('mysql', fields));

    act(() => {
      result.current.setEstimateRows(0);
    });

    expect(result.current.totalSize).toBe(0);
    expect(result.current.totalSizeFormatted).toBe('0 B');
  });
});
