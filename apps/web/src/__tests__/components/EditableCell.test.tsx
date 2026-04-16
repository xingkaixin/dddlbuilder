import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/__tests__/utils/test-utils';
import { EditableCell } from '@/components/App/table/EditableCell';

describe('EditableCell', () => {
  it('单击选中后输入不应丢失首字符', async () => {
    const onChange = vi.fn();

    render(<EditableCell value="old-value" onChange={onChange} />);

    const cell = screen.getByTitle('old-value');
    await userEvent.click(cell);
    fireEvent.keyDown(cell, { key: 'a' });

    const input = await screen.findByDisplayValue('a');
    await userEvent.type(input, 'bcde');

    expect(input).toHaveValue('abcde');

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('abcde');
  });
});
