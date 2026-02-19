import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFieldColumns } from '@/components/App/table/columns';

describe('useFieldColumns', () => {
  it('模板模式应与字段配置保持一致的列顺序', () => {
    const { result } = renderHook(() =>
      useFieldColumns({
        mode: 'template',
        columnWidths: {
          order: 72,
          fieldName: 120,
          fieldComment: 150,
          fieldType: 120,
          nullable: 70,
          defaultKind: 110,
          defaultValue: 100,
          onUpdate: 100,
          actions: 56,
        },
        rowWarnings: [[]],
        dbType: 'mysql',
        updateCellValue: vi.fn(),
        handleTabNavigation: vi.fn(),
        onRemoveRow: vi.fn(),
      }),
    );

    const columnIds = result.current.map((column) => {
      if ('id' in column && column.id) return column.id;
      if ('accessorKey' in column && column.accessorKey) {
        return String(column.accessorKey);
      }
      return '';
    });

    expect(columnIds).toEqual([
      'order',
      'fieldName',
      'fieldComment',
      'fieldType',
      'nullable',
      'defaultKind',
      'defaultValue',
      'onUpdate',
      'actions',
    ]);
  });
});
