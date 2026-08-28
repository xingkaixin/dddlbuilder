import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/__tests__/utils/test-utils';
import { PartitionPanel } from '@/components/App/PartitionPanel';
import type { MysqlPartitionConfig } from '@ddlbuilder/shared-types';

const callbacks = {
  onEnabledChange: vi.fn(),
  onTypeChange: vi.fn(),
  onColumnsChange: vi.fn(),
  onExpressionChange: vi.fn(),
  onPartitionCountChange: vi.fn(),
  onAddPartition: vi.fn(),
  onRemovePartition: vi.fn(),
  onUpdatePartition: vi.fn(),
  onGeneratePartitions: vi.fn(),
};

describe('PartitionPanel editing', () => {
  it('keeps the focused row attached to its partition after deleting an earlier row', () => {
    const config: MysqlPartitionConfig = {
      enabled: true,
      type: 'RANGE',
      columns: ['id'],
      partitions: [
        { id: 'first', name: 'p1', value: '10' },
        { id: 'second', name: 'p2', value: '20' },
        { id: 'third', name: 'p3', value: '30' },
      ],
    };
    const { rerender } = render(
      <PartitionPanel {...callbacks} config={config} availableFields={['id']} />,
    );
    const input = screen.getByDisplayValue('20');
    input.focus();
    rerender(
      <PartitionPanel
        {...callbacks}
        config={{ ...config, partitions: config.partitions?.slice(1) }}
        availableFields={['id']}
      />,
    );
    expect(input).toHaveFocus();
    expect(input).toHaveValue('20');
  });

  it('allows clearing the count while editing and normalizes on blur', () => {
    const changed = vi.fn();
    function Harness() {
      const [count, setCount] = useState(4);
      return (
        <PartitionPanel
          {...callbacks}
          config={{ enabled: true, type: 'HASH', columns: ['id'], partitionCount: count }}
          availableFields={['id']}
          onPartitionCountChange={(next) => {
            changed(next);
            setCount(next);
          }}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);
    expect(changed).toHaveBeenLastCalledWith(12);
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(1);
  });
});
