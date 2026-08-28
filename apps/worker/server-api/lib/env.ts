export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export const readEnvBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

export const parseAllowedOrigins = (envOrigins?: string): string[] => {
  const raw = envOrigins?.trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : DEFAULT_ALLOWED_ORIGINS;
};
