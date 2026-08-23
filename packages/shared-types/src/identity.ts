type CryptoRuntime = typeof globalThis & {
  crypto: {
    randomUUID: () => string;
  };
};

export const createEntityId = (): string => (globalThis as CryptoRuntime).crypto.randomUUID();
