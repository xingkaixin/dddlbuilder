type CryptoRuntime = typeof globalThis & {
  crypto: {
    randomUUID: () => string;
  };
};

// SAFETY: browser and Worker runtimes provide globalThis.crypto.randomUUID.
export const createEntityId = (): string => (globalThis as CryptoRuntime).crypto.randomUUID();
