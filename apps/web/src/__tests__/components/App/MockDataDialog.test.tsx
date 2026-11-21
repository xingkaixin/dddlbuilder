import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { NormalizedField } from '@ddlbuilder/shared-types';
import { render } from '@/__tests__/utils/test-utils';
import { MockDataDialog } from '@/components/App/MockDataDialog';
import { generateMockData } from '@/utils/mockDataGenerator';

const sampleFields: NormalizedField[] = [
  {
    name: 'id',
    type: 'bigint',
    comment: '',
    nullable: false,
    defaultKind: 'auto_increment',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'name',
    type: 'varchar(50)',
    comment: '',
    nullable: false,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'email',
    type: 'varchar(100)',
    comment: '',
    nullable: false,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  },
];

describe('MockDataDialog', () => {
  it('renders deterministic seeded output and regenerates with the next seed', () => {
    const expectedSeed0 = generateMockData('users', '', sampleFields, 'mysql', {
      rowCount: 10,
      seed: 0,
    }).insertSql;
    const expectedSeed1 = generateMockData('users', '', sampleFields, 'mysql', {
      rowCount: 10,
      seed: 1,
    }).insertSql;

    render(
      <MockDataDialog
        open
        onOpenChange={vi.fn()}
        tableName="users"
        schemaName=""
        dbType="mysql"
        fields={sampleFields}
      />,
    );

    const preview = screen.getByRole('tabpanel').querySelector('pre');
    expect(preview?.textContent).toBe(expectedSeed0);

    fireEvent.click(screen.getByRole('button', { name: '重新生成' }));

    expect(preview?.textContent).toBe(expectedSeed1);
    expect(expectedSeed1).not.toBe(expectedSeed0);
  });
});
