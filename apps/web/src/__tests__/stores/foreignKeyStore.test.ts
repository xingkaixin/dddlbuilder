import { renameEditorField } from '@/__tests__/utils/editorFields';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';

function resetForeignKeyStore() {
  useEditorStore.setState({ foreignKeys: [] });
}

describe('foreignKeyStore', () => {
  beforeEach(() => {
    resetForeignKeyStore();
  });

  it('initializes with empty foreign keys', () => {
    expect(useEditorStore.getState().foreignKeys).toEqual([]);
  });

  it('sets foreign keys directly', () => {
    const fks = [
      { id: 'fk1', name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] },
    ];
    useEditorStore.getState().setForeignKeys(fks);
    expect(useEditorStore.getState().foreignKeys).toEqual(fks);
  });

  it('sets foreign keys with function updater', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    useEditorStore
      .getState()
      .setForeignKeys((prev) =>
        prev.map((fk) => (fk.name === 'fk_user' ? { ...fk, name: 'fk_account' } : fk)),
      );
    expect(useEditorStore.getState().foreignKeys[0].name).toBe('fk_account');
  });

  it('adds a foreign key with generated id', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    const fks = useEditorStore.getState().foreignKeys;
    expect(fks).toHaveLength(1);
    expect(fks[0].name).toBe('fk_user');
    expect(fks[0].id).toBeDefined();
  });

  it('removes a foreign key by id', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    const id = useEditorStore.getState().foreignKeys[0].id;
    useEditorStore.getState().removeForeignKey(id);
    expect(useEditorStore.getState().foreignKeys).toHaveLength(0);
  });

  it('updates a foreign key', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    const id = useEditorStore.getState().foreignKeys[0].id;
    useEditorStore.getState().updateForeignKey(id, { refTable: 'accounts' });
    expect(useEditorStore.getState().foreignKeys[0].refTable).toBe('accounts');
  });

  it('does not update non-matching foreign key', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    useEditorStore.getState().updateForeignKey('non-existent', { refTable: 'accounts' });
    expect(useEditorStore.getState().foreignKeys[0].refTable).toBe('users');
  });

  it('syncs field rename across foreign keys', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id', 'org_id'],
      refTable: 'users',
      refFields: ['id', 'org_id'],
    });
    renameEditorField('user_id', 'account_id');
    expect(useEditorStore.getState().foreignKeys[0].fields).toEqual(['account_id', 'org_id']);
  });

  it('does not sync when old and new names are the same', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    renameEditorField('user_id', 'user_id');
    expect(useEditorStore.getState().foreignKeys[0].fields).toEqual(['user_id']);
  });

  it('does not sync when old name is empty', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    renameEditorField('', 'account_id');
    expect(useEditorStore.getState().foreignKeys[0].fields).toEqual(['user_id']);
  });

  it('does not affect foreign keys without the renamed field', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    renameEditorField('org_id', 'organization_id');
    expect(useEditorStore.getState().foreignKeys[0].fields).toEqual(['user_id']);
  });

  it('resets foreign key state', () => {
    useEditorStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    useEditorStore.getState().resetForeignKeyState();
    expect(useEditorStore.getState().foreignKeys).toEqual([]);
  });
});
