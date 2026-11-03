import { beforeEach, describe, expect, it } from 'vitest';
import { createFieldRow } from '@/__tests__/utils/testFactories';
import { act, fireEvent, render, screen } from '@/__tests__/utils/test-utils';
import { IndexPanel } from '@/components/App/IndexPanel';
import { useEditorStore } from '@/stores';

function setupStores() {
  useEditorStore.getState().setTableName('orders');
  useEditorStore.getState().setDbType('mysql');

  useEditorStore.getState().setRows([
    createFieldRow('id-field', {
      fieldName: 'id',
      fieldComment: '主键',
      fieldType: 'bigint',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    }),
    createFieldRow('user-id-field', {
      fieldName: 'user_id',
      fieldComment: '用户ID',
      fieldType: 'bigint',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    }),
    createFieldRow('item-id-field', {
      fieldName: 'item_id',
      fieldComment: '商品ID',
      fieldType: 'bigint',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    }),
  ]);

  useEditorStore.getState().resetIndexState();
}

describe('IndexPanel a11y', () => {
  it('preserves a unique constraint when editing its name', () => {
    useEditorStore.getState().setIndexes([
      {
        id: 'uq',
        name: 'uq_user',
        kind: 'unique_constraint',
        fields: [{ name: 'user_id', direction: 'ASC' }],
      },
    ]);
    render(<IndexPanel availableFields={['id', 'user_id', 'item_id']} />);
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);
    fireEvent.change(screen.getByDisplayValue('uq_user'), { target: { value: 'uq_order_user' } });
    fireEvent.click(screen.getByRole('button', { name: '保存索引' }));
    expect(useEditorStore.getState().indexes).toEqual([
      {
        id: 'uq',
        name: 'uq_order_user',
        kind: 'unique_constraint',
        fields: [{ name: 'user_id', direction: 'ASC' }],
      },
    ]);
  });
  it('keeps an edited draft when its source index is removed externally', () => {
    useEditorStore.getState().setIndexes([
      {
        id: 'original',
        name: 'idx_orders_id',
        fields: [{ name: 'id', direction: 'ASC' }],
        kind: 'index',
      },
    ]);
    render(<IndexPanel availableFields={['id', 'user_id', 'item_id']} />);
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

  it('rejects creating a duplicate index name', async () => {
    useEditorStore.getState().setIndexes([
      {
        id: 'existing',
        name: 'idx_orders_id',
        fields: [{ name: 'id', direction: 'ASC' }],
        kind: 'index',
      },
    ]);
    render(<IndexPanel availableFields={['id', 'user_id', 'item_id']} />);
    fireEvent.click(screen.getByRole('button', { name: '添加索引' }));
    fireEvent.change(screen.getByPlaceholderText('留空则自动生成'), {
      target: { value: 'IDX_ORDERS_ID' },
    });
    const fieldInput = screen.getByPlaceholderText('输入字段名进行匹配...');
    fireEvent.change(fieldInput, { target: { value: 'user_id' } });
    fireEvent.click(await screen.findByRole('option', { name: 'user_id' }));
    fireEvent.click(screen.getByRole('button', { name: '保存索引' }));

    expect(useEditorStore.getState().indexes).toHaveLength(1);
    expect(screen.getByDisplayValue('IDX_ORDERS_ID')).toBeInTheDocument();
  });

  beforeEach(() => {
    setupStores();
  });
});
