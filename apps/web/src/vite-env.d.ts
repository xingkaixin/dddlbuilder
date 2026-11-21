/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BETTER_AUTH_URL?: string;
  readonly VITE_ENABLE_CNY_FIREWORKS?: string | boolean;
  readonly VITE_ENABLE_AI_STREAM_DEBUG?: string | boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
