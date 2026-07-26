import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/__tests__/utils/test-utils';
import { EditableCell } from '@/components/App/table/EditableCell';

describe('EditableCell', () => {
  it('聚焦后输入不应丢失首字符', async () => {
    const onChange = vi.fn();

    render(<EditableCell value="old-value" onChange={onChange} />);

    const cell = screen.getByTitle('old-value');
    fireEvent.focus(cell);

    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();
    await userEvent.keyboard('abcde');

    expect(input).toHaveValue('abcde');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('abcde');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('编辑输入框应禁用密码管理器填充', () => {
    render(<EditableCell value="" onChange={vi.fn()} placeholder="字段名" />);

    fireEvent.focus(screen.getByTitle('字段名'));

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('data-1p-ignore', 'true');
    expect(input).toHaveAttribute('data-op-ignore', 'true');
  });

  it('编辑输入框不应叠加单元格焦点边框', () => {
    render(<EditableCell value="field_name" onChange={vi.fn()} />);

    fireEvent.focus(screen.getByTitle('field_name'));

    expect(screen.getByRole('textbox')).toHaveClass(
      'border-transparent',
      'shadow-none',
      'focus-visible:ring-0',
      'focus-visible:ring-offset-0',
    );
  });
});
