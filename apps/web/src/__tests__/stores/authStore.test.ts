import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';

function resetAuthStore() {
  useEditorStore.getState().resetAuthState();
}

describe('authStore', () => {
  beforeEach(() => {
    resetAuthStore();
  });

  it('应该设置输入并添加授权对象', () => {
    const state = useEditorStore.getState();

    state.setAuthInput('user1');
    state.addAuthObject('user1');

    const current = useEditorStore.getState();
    expect(current.authInput).toBe('');
    expect(current.authObjects).toEqual(['user1']);
  });

  it('应该忽略重复和空白授权对象', () => {
    const state = useEditorStore.getState();

    state.addAuthObject('user1');
    state.addAuthObject('user1');
    state.addAuthObject('   ');

    const current = useEditorStore.getState();
    expect(current.authObjects).toEqual(['user1']);
  });

  it('应该支持函数式更新和重置', () => {
    const state = useEditorStore.getState();

    state.setAuthObjects(['user1']);
    state.setAuthObjects((prev) => [...prev, 'user2']);
    state.removeAuthObject(0);

    let current = useEditorStore.getState();
    expect(current.authObjects).toEqual(['user2']);

    current.resetAuthState();
    current = useEditorStore.getState();
    expect(current.authInput).toBe('');
    expect(current.authObjects).toEqual([]);
  });
});
