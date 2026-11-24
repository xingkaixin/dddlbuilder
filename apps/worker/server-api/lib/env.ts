export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export const readEnvBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

let cachedRawOrigins: string | undefined;
let cachedParsedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS;

export const parseAllowedOrigins = (envOrigins?: string): string[] => {
  if (envOrigins === cachedRawOrigins) return cachedParsedOrigins;

  const raw = envOrigins?.trim();

  const parsed = raw
    ? raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  cachedRawOrigins = envOrigins;
  cachedParsedOrigins = parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;

  return cachedParsedOrigins;
};
