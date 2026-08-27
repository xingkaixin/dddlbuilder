import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@/__tests__/utils/test-utils';
import { ForeignKeyPanel } from '@/components/App/ForeignKeyPanel';
import { useEditorStore } from '@/stores';

describe('ForeignKeyPanel dialect actions', () => {
  beforeEach(() => {
    useEditorStore.setState({ dbType: 'oracle', tableName: 'orders', foreignKeys: [] });
  });

  it('only offers supported Oracle actions', () => {
    render(<ForeignKeyPanel availableFields={['user_id']} />);
    fireEvent.click(screen.getByRole('button', { name: '添加外键' }));

    expect(
      within(screen.getByLabelText('删除时'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['无动作', 'CASCADE', 'SET NULL']);
    expect(
      within(screen.getByLabelText('更新时'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['无动作']);
  });

  it('preserves and rejects an unsupported selection after switching databases', () => {
    useEditorStore.setState({ dbType: 'mysql' });
    render(<ForeignKeyPanel availableFields={['user_id']} />);
    fireEvent.click(screen.getByRole('button', { name: '添加外键' }));
    fireEvent.click(screen.getByRole('button', { name: 'user_id' }));
    fireEvent.change(screen.getByPlaceholderText('例如: users'), { target: { value: 'users' } });
    const refField = screen.getByPlaceholderText('输入字段名，回车添加');
    fireEvent.change(refField, { target: { value: 'id' } });
    fireEvent.keyDown(refField, { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('更新时'), { target: { value: 'CASCADE' } });
    const confirm = screen.getByRole('button', { name: '确认添加' });
    expect(confirm).toBeEnabled();

    act(() => useEditorStore.setState({ dbType: 'oracle' }));
    expect(screen.getByLabelText('更新时')).toHaveValue('CASCADE');
    expect(screen.getByRole('alert')).toHaveTextContent('当前数据库不支持');
    expect(confirm).toBeDisabled();
    expect(useEditorStore.getState().foreignKeys).toEqual([]);

    fireEvent.change(screen.getByLabelText('更新时'), { target: { value: '' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(useEditorStore.getState().foreignKeys).toHaveLength(1);
    expect(useEditorStore.getState().foreignKeys[0].onUpdate).toBeUndefined();
  });

  it('warns about unsupported actions in an existing foreign key', () => {
    useEditorStore.setState({
      foreignKeys: [
        {
          id: 'fk-user',
          name: 'fk_user',
          fields: ['user_id'],
          refTable: 'users',
          refFields: ['id'],
          onUpdate: 'CASCADE',
        },
      ],
    });
    render(<ForeignKeyPanel availableFields={['user_id']} />);
    expect(screen.getByRole('alert')).toHaveTextContent('已有外键请删除后重新配置');
    expect(screen.getByText('CASCADE')).toBeInTheDocument();
  });
});
