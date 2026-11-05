import { describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores/editorStore';

describe('tableOptionsStore', () => {
  it('应该限制数据库数值选项', () => {
    const state = useEditorStore.getState();

    state.setFillfactor(-50);
    state.setPctfree(500);
    state.setInitrans(0);

    expect(useEditorStore.getState().tableMiscConfig).toMatchObject({
      fillfactor: 10,
      pctfree: 99,
      initrans: 1,
    });
  });
});
