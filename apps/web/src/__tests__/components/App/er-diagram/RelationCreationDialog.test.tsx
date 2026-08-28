import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { render, screen, userEvent } from '@/__tests__/utils/test-utils';
import { RelationCreationDialog } from '@/components/App/er-diagram/RelationCreationDialog';

const source: PersistedState = {
  tableName: 'orders',
  tableComment: '',
  dbType: 'oracle',
  sqlFormatMode: 'compact',
  rows: [{ order: 1, fieldName: 'user_id', fieldType: 'INT', fieldComment: '', nullable: true }],
  indexes: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  authInput: '',
  authObjects: [],
};
const target: PersistedState = {
  ...source,
  tableName: 'users',
  rows: [{ order: 1, fieldName: 'id', fieldType: 'INT', fieldComment: '', nullable: false }],
  indexes: [
    {
      id: 'pk-users',
      name: 'pk_users',

      kind: 'primary',
      fields: [{ name: 'id', direction: 'ASC' }],
    },
  ],
};

describe('RelationCreationDialog dialect actions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers supported Oracle actions and leaves the update clause absent', async () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue(document.createElement('div').style);
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <RelationCreationDialog
        draft={{ source, target }}
        sourceField="user_id"
        targetField="id"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByLabelText('更新引用键时'));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      '无动作',
    ]);
    await userEvent.click(screen.getByRole('option', { name: '无动作' }));
    await userEvent.click(screen.getByLabelText('删除引用记录时'));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      '无动作',
      'CASCADE',
      'SET NULL',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'CASCADE' }));
    await userEvent.click(screen.getByRole('button', { name: '创建关系' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ onDelete: 'CASCADE' });
    expect(onConfirm.mock.calls[0][0].onUpdate).toBeUndefined();
  });
});
