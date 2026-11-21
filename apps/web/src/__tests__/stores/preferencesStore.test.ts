import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PREFERENCES_KEY = 'ddlbuilder:preferences:v1';

async function loadPreferencesStore() {
  vi.resetModules();
  const module = await import('@/stores/preferencesStore');

  return module.usePreferencesStore;
}

describe('preferencesStore', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.mocked(localStorage.getItem).mockImplementation((key) => storage.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      storage.set(key, value);
    });
    vi.mocked(localStorage.clear).mockImplementation(() => {
      storage.clear();
    });
  });

  afterEach(() => {
    vi.mocked(localStorage.getItem).mockReset();
    vi.mocked(localStorage.setItem).mockReset();
    vi.mocked(localStorage.clear).mockReset();
  });

  it.each(['null', '[]', '"plain"', '123', '{broken'])(
    'falls back to defaults when stored preferences JSON is %s',
    async (raw) => {
      storage.set(PREFERENCES_KEY, raw);

      const store = await loadPreferencesStore();
      const state = store.getState();

      expect(state.font).toBe('hand');
      expect(state.density).toBe('comfortable');
      expect(state.defaultDatabase).toBe('mysql');
      expect(state.layout).toBe('side');
      expect(state.hiddenFieldColumns).toEqual(['onUpdate']);
      expect(state.sqlFormatMode).toBe('compact');
      expect(state.addRowCount).toBe(10);
      expect(state.pinnedTools).toEqual([]);
      expect(state.checklistDismissed).toBe(false);
      expect(Object.hasOwn(state, '0')).toBe(false);
      state.setPreference('density', 'compact');
      expect(store.getState().density).toBe('compact');
    },
  );

  it('keeps valid fields and falls back malformed fields in partial objects', async () => {
    storage.set(
      PREFERENCES_KEY,
      JSON.stringify({
        font: 'plain',
        density: 123,
        defaultDatabase: 'not-a-db',
        layout: null,
        hiddenFieldColumns: 'onUpdate',
        sqlFormatMode: 'aligned',
        addRowCount: 0,
        pinnedTools: ['er', 42],
        checklistDismissed: 'true',
        setPreference: 'tampered',
      }),
    );

    const store = await loadPreferencesStore();
    const state = store.getState();

    expect(state.font).toBe('plain');
    expect(state.density).toBe('comfortable');
    expect(state.defaultDatabase).toBe('mysql');
    expect(state.layout).toBe('side');
    expect(state.hiddenFieldColumns).toEqual(['onUpdate']);
    expect(state.sqlFormatMode).toBe('aligned');
    expect(state.addRowCount).toBe(10);
    expect(state.pinnedTools).toEqual([]);
    expect(state.checklistDismissed).toBe(false);
    state.setPreference('density', 'compact');
    expect(store.getState().density).toBe('compact');
  });
});
