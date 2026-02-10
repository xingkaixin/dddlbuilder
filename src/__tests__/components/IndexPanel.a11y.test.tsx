import { beforeEach, describe, expect, it } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@/__tests__/utils/test-utils';
import { IndexPanel } from '@/components/App/IndexPanel';
import { useAppStore, useFieldStore, useIndexStore } from '@/stores';

function setupStores() {
  useAppStore.getState().setTableName('orders');
  useAppStore.getState().setDbType('mysql');

  useFieldStore.getState().setRows([
    {
      order: 1,
      fieldName: 'id',
      fieldComment: '主键',
      fieldType: 'bigint',
      nullable: '否',
      defaultKind: '无',
      defaultValue: '',
      onUpdate: '无',
    },
    {
      order: 2,
      fieldName: 'user_id',
      fieldComment: '用户ID',
      fieldType: 'bigint',
      nullable: '否',
      defaultKind: '无',
      defaultValue: '',
      onUpdate: '无',
    },
    {
      order: 3,
      fieldName: 'item_id',
      fieldComment: '商品ID',
      fieldType: 'bigint',
      nullable: '否',
      defaultKind: '无',
      defaultValue: '',
      onUpdate: '无',
    },
  ]);

  useIndexStore.getState().resetIndexState();
}

describe('IndexPanel a11y', () => {
  beforeEach(() => {
    setupStores();
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
    expect(input).toHaveAttribute(
      'aria-controls',
      'index-field-suggestions-listbox',
    );
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      'index-field-suggestion-0',
    );

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      'index-field-suggestion-1',
    );

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
