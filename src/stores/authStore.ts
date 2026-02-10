import { create } from 'zustand';

type Setter<T> = T | ((prev: T) => T);

interface AuthStoreState {
  authInput: string;
  authObjects: string[];
  setAuthInput: (value: Setter<string>) => void;
  setAuthObjects: (value: Setter<string[]>) => void;
  addAuthObject: (authObj: string) => void;
  removeAuthObject: (index: number) => void;
  resetAuthState: () => void;
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  authInput: '',
  authObjects: [],
  setAuthInput: (value) =>
    set((state) => ({
      authInput: typeof value === 'function' ? value(state.authInput) : value,
    })),
  setAuthObjects: (value) =>
    set((state) => ({
      authObjects:
        typeof value === 'function' ? value(state.authObjects) : value,
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
}));
