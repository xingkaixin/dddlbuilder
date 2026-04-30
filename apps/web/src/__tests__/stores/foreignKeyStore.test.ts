import { beforeEach, describe, expect, it } from 'vitest';
import { useForeignKeyStore } from '@/stores/foreignKeyStore';

function resetForeignKeyStore() {
  useForeignKeyStore.setState({ foreignKeys: [] });
}

describe('foreignKeyStore', () => {
  beforeEach(() => {
    resetForeignKeyStore();
  });

  it('initializes with empty foreign keys', () => {
    expect(useForeignKeyStore.getState().foreignKeys).toEqual([]);
  });

  it('sets foreign keys directly', () => {
    const fks = [
      { id: 'fk1', name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] },
    ];
    useForeignKeyStore.getState().setForeignKeys(fks);
    expect(useForeignKeyStore.getState().foreignKeys).toEqual(fks);
  });

  it('sets foreign keys with function updater', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    useForeignKeyStore
      .getState()
      .setForeignKeys((prev) =>
        prev.map((fk) => (fk.name === 'fk_user' ? { ...fk, name: 'fk_account' } : fk)),
      );
    expect(useForeignKeyStore.getState().foreignKeys[0].name).toBe('fk_account');
  });

  it('initializes from persisted state', () => {
    useForeignKeyStore.getState().initializeForeignKeyState({
      foreignKeys: [
        { id: 'fk1', name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] },
      ],
    });
    expect(useForeignKeyStore.getState().foreignKeys).toHaveLength(1);
  });

  it('does nothing when initializing with undefined', () => {
    useForeignKeyStore.getState().initializeForeignKeyState(undefined);
    expect(useForeignKeyStore.getState().foreignKeys).toEqual([]);
  });

  it('adds a foreign key with generated id', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    const fks = useForeignKeyStore.getState().foreignKeys;
    expect(fks).toHaveLength(1);
    expect(fks[0].name).toBe('fk_user');
    expect(fks[0].id).toBeDefined();
  });

  it('removes a foreign key by id', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    const id = useForeignKeyStore.getState().foreignKeys[0].id;
    useForeignKeyStore.getState().removeForeignKey(id);
    expect(useForeignKeyStore.getState().foreignKeys).toHaveLength(0);
  });

  it('updates a foreign key', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    const id = useForeignKeyStore.getState().foreignKeys[0].id;
    useForeignKeyStore.getState().updateForeignKey(id, { refTable: 'accounts' });
    expect(useForeignKeyStore.getState().foreignKeys[0].refTable).toBe('accounts');
  });

  it('does not update non-matching foreign key', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    useForeignKeyStore.getState().updateForeignKey('non-existent', { refTable: 'accounts' });
    expect(useForeignKeyStore.getState().foreignKeys[0].refTable).toBe('users');
  });

  it('syncs field rename across foreign keys', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id', 'org_id'],
      refTable: 'users',
      refFields: ['id', 'org_id'],
    });
    useForeignKeyStore.getState().syncFieldRename('user_id', 'account_id');
    expect(useForeignKeyStore.getState().foreignKeys[0].fields).toEqual(['account_id', 'org_id']);
  });

  it('does not sync when old and new names are the same', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    useForeignKeyStore.getState().syncFieldRename('user_id', 'user_id');
    expect(useForeignKeyStore.getState().foreignKeys[0].fields).toEqual(['user_id']);
  });

  it('does not sync when old name is empty', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    useForeignKeyStore.getState().syncFieldRename('', 'account_id');
    expect(useForeignKeyStore.getState().foreignKeys[0].fields).toEqual(['user_id']);
  });

  it('does not affect foreign keys without the renamed field', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    useForeignKeyStore.getState().syncFieldRename('org_id', 'organization_id');
    expect(useForeignKeyStore.getState().foreignKeys[0].fields).toEqual(['user_id']);
  });

  it('resets foreign key state', () => {
    useForeignKeyStore.getState().addForeignKey({
      name: 'fk_user',
      fields: ['user_id'],
      refTable: 'users',
      refFields: ['id'],
    });
    useForeignKeyStore.getState().resetForeignKeyState();
    expect(useForeignKeyStore.getState().foreignKeys).toEqual([]);
  });
});
