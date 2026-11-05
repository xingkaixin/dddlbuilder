import { describe, expect, it, vi } from 'vitest';
import { render } from '@/__tests__/utils/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('受控进入编辑时应使用外部更新后的值作为输入和提交基线', async () => {
    const onChange = vi.fn();

    const { rerender } = render(
      <EditableCell value="主键" onChange={onChange} isEditing={false} />,
    );

    rerender(<EditableCell value="远端新注释" onChange={onChange} isEditing={false} />);
    rerender(<EditableCell value="远端新注释" onChange={onChange} isEditing />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('远端新注释');

    await userEvent.clear(input);
    await userEvent.keyboard('主键{Enter}');

    expect(onChange).toHaveBeenCalledWith('主键');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
