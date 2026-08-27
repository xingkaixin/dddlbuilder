import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { assert, describe, expect, it, vi } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { useTemplateActions } from '@/components/App/hooks/useTemplateActions';
import type { FieldTemplate } from '@/utils/fieldTemplates';
import { createEmptyRow } from '@/utils/helpers';

function renderTemplateActions(initialRows: FieldRow[]) {
  return renderHook(() => {
    const [rows, setRows] = useState(initialRows);
    const actions = useTemplateActions({
      rows,
      setRows,
      createTemplateFromFields: vi.fn(),
      showToast: vi.fn(),
    });
    return { rows, ...actions };
  });
}

describe('useTemplateActions', () => {
  it('applies logical enums with fresh IDs and independently editable metadata', () => {
    const enumMeta = [
      { value: '1', color: '#16a34a', i18n: { 'zh-CN': '启用', 'en-US': 'Active' } },
    ];
    const template = {
      id: 'template-status',
      name: '状态模板',
      fields: [{ fieldName: 'status', fieldType: 'INT', nullable: false, enumMeta }],
      createdAt: 1,
      updatedAt: 1,
    } satisfies FieldTemplate;
    const existing = { ...createEmptyRow(), fieldName: 'id' };
    const empty = createEmptyRow();
    const { result } = renderTemplateActions([existing, empty]);

    act(() => result.current.handleApplyTemplate(template));
    act(() => result.current.handleApplyTemplate(template));
    const [first, second] = result.current.rows.slice(1, 3);
    console.info('Applied template enum metadata', { first, second });

    expect(result.current.rows.map((row) => row.fieldName)).toEqual(['id', 'status', 'status', '']);
    expect(new Set(result.current.rows.map((row) => row.id)).size).toBe(4);
    expect(first.enumMeta).toEqual(enumMeta);
    expect(second.enumMeta).toEqual(enumMeta);
    const firstLabels = first.enumMeta?.[0].i18n;
    assert(firstLabels);
    firstLabels['zh-CN'] = '已修改';
    expect(template.fields[0].enumMeta[0].i18n['zh-CN']).toBe('启用');
    expect(second.enumMeta?.[0].i18n?.['zh-CN']).toBe('启用');
    expect(first).toMatchObject({
      fieldComment: '',
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    });
    expect(result.current.rows[0]).toBe(existing);
    expect(result.current.rows[3]).toBe(empty);
  });
});
