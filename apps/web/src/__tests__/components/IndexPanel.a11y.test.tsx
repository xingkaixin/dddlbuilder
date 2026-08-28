import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@/__tests__/utils/test-utils';
import { IndexPanel } from '@/components/App/IndexPanel';
import { useEditorStore } from '@/stores';

function setupStores() {
  useEditorStore.getState().setTableName('orders');
  useEditorStore.getState().setDbType('mysql');

  useEditorStore.getState().setRows([
    {
      order: 1,
      fieldName: 'id',
      fieldComment: '主键',
      fieldType: 'bigint',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      order: 2,
      fieldName: 'user_id',
      fieldComment: '用户ID',
      fieldType: 'bigint',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      order: 3,
      fieldName: 'item_id',
      fieldComment: '商品ID',
      fieldType: 'bigint',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ]);

  useEditorStore.getState().resetIndexState();
}

describe('IndexPanel a11y', () => {
  it('keeps an edited draft when its source index is removed externally', () => {
    useEditorStore.getState().setIndexes([
      {
        id: 'original',
        name: 'idx_orders_id',
        fields: [{ name: 'id', direction: 'ASC' }],
        unique: false,
      },
    ]);
    render(<IndexPanel />);
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);
    const nameInput = screen.getByDisplayValue('idx_orders_id');
    fireEvent.change(nameInput, { target: { value: 'local_draft_index' } });
    act(() => useEditorStore.getState().setIndexes([]));
    fireEvent.click(screen.getByRole('button', { name: '保存索引' }));
    expect(useEditorStore.getState().indexes).toEqual([]);
    expect(screen.getByDisplayValue('local_draft_index')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存索引' }));
    expect(useEditorStore.getState().indexes).toEqual([
      expect.objectContaining({ name: 'local_draft_index' }),
    ]);
  });
  beforeEach(() => {
    setupStores();
  });

  it('requires confirmation before deleting a primary index', () => {
    useEditorStore.getState().setIndexes([
      {
        id: 'primary',
        name: 'pk_orders',
        fields: [{ name: 'id', direction: 'ASC' }],
        unique: true,
        isPrimary: true,
      },
    ]);
    render(<IndexPanel />);
    fireEvent.click(screen.getByRole('button', { name: '删除索引' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '取消' }));
    expect(useEditorStore.getState().indexes).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '删除索引' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '删除索引' }),
    );
    expect(useEditorStore.getState().indexes).toEqual([]);
  });

  it('字段建议输入框应具备 combobox/listbox 语义并支持上下键导航', async () => {
    render(<IndexPanel />);

    const input = screen.getByPlaceholderText('输入字段名进行匹配...');
    fireEvent.change(input, { target: { value: 'id' } });

    const listbox = await screen.findByRole('listbox', { name: '字段建议' });
    expect(listbox).toBeInTheDocument();

    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', 'index-field-suggestions-listbox');
    expect(input).toHaveAttribute('aria-activedescendant', 'index-field-suggestion-0');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'index-field-suggestion-1');

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: '字段建议' })).toBeNull();
    });
    expect(input).toHaveValue('');
    expect(screen.getByText('user_id')).toBeInTheDocument();
  });

  it('按 Escape 应关闭字段建议下拉框', async () => {
    render(<IndexPanel />);

    const input = screen.getByPlaceholderText('输入字段名进行匹配...');
    fireEvent.change(input, { target: { value: 'id' } });
    await screen.findByRole('listbox', { name: '字段建议' });

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: '字段建议' })).toBeNull();
    });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});
