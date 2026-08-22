import type { AuthSlice, EditorGetState, EditorSetState } from './editorStoreTypes';

export const createAuthSlice = (set: EditorSetState, get: EditorGetState): AuthSlice => ({
  authInput: '',
  authObjects: [],
  setAuthInput: (value) =>
    set((state) => ({
      authInput: typeof value === 'function' ? value(state.authInput) : value,
    })),
  setAuthObjects: (value) =>
    set((state) => ({
      authObjects: typeof value === 'function' ? value(state.authObjects) : value,
    })),
  addAuthObject: (authObj) => {
    const trimmed = authObj.trim();
    if (!trimmed || get().authObjects.includes(trimmed)) {
      return;
    }

    set((state) => ({
      authObjects: [...state.authObjects, trimmed],
      authInput: '',
    }));
  },
  removeAuthObject: (index) =>
    set((state) => ({
      authObjects: state.authObjects.filter((_, i) => i !== index),
    })),
  resetAuthState: () =>
    set({
      authInput: '',
      authObjects: [],
    }),
});
