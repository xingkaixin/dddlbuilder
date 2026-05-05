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
});
