import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores';

function resetAuthStore() {
  useAuthStore.getState().resetAuthState();
}

describe('authStore', () => {
  beforeEach(() => {
    resetAuthStore();
  });

  it('应该设置输入并添加授权对象', () => {
    const state = useAuthStore.getState();

    state.setAuthInput('user1');
    state.addAuthObject('user1');

    const current = useAuthStore.getState();
    expect(current.authInput).toBe('');
    expect(current.authObjects).toEqual(['user1']);
  });

  it('应该忽略重复和空白授权对象', () => {
    const state = useAuthStore.getState();

    state.addAuthObject('user1');
    state.addAuthObject('user1');
    state.addAuthObject('   ');

    const current = useAuthStore.getState();
    expect(current.authObjects).toEqual(['user1']);
  });

  it('应该支持函数式更新和重置', () => {
    const state = useAuthStore.getState();

    state.setAuthObjects(['user1']);
    state.setAuthObjects((prev) => [...prev, 'user2']);
    state.removeAuthObject(0);

    let current = useAuthStore.getState();
    expect(current.authObjects).toEqual(['user2']);

    current.resetAuthState();
    current = useAuthStore.getState();
    expect(current.authInput).toBe('');
    expect(current.authObjects).toEqual([]);
  });
});
