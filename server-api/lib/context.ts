export type ApiEnv = {
  Variables: {
    requestId: string;
  };
  Bindings: {
    SHARE_KV: KVNamespace;
    RATE_LIMIT_KV: KVNamespace;
  };
};
