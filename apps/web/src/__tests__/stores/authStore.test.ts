import { describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores/editorStore';

describe('authStore', () => {
  it('应该忽略重复和空白授权对象', () => {
    const state = useEditorStore.getState();

    state.addAuthObject('user1');
    state.addAuthObject('user1');
    state.addAuthObject('   ');

    const current = useEditorStore.getState();
    expect(current.authObjects).toEqual(['user1']);
  });
});
