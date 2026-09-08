import type {
  ApiMetaSchema,
  CurrentWorkspaceResponseSchema,
  WorkspaceMigrationResponseSchema,
} from './apiContracts.js';

export const API_ERROR_CODES = [
  'AUTH_REQUIRED',
  'INVALID_AUTH_TOKEN',
  'USER_DISABLED',
  'CREDIT_EXHAUSTED',
  'TURNSTILE_REQUIRED',
  'TURNSTILE_FAILED',
  'PAYLOAD_TOO_LARGE',
  'INVALID_JSON',
  'SQL_REQUIRED',
  'SQL_TOO_LONG',
  'INVALID_DATABASE_TYPE',
  'SQL_PARSE_FAILED',
  'OPENAI_API_KEY_MISSING',
  'EXPLAIN_FAILED',
  'REVIEW_FAILED',
  'GENERATION_FAILED',
  'DESCRIPTION_REQUIRED',
  'SCHEMA_REQUIRED',
  'DDL_REQUIRED',
  'REDIS_CONFIG_MISSING',
  'KV_CONFIG_MISSING',
  'SHARE_STATE_REQUIRED',
  'SHARE_STATE_INVALID',
  'SHARE_UUID_INVALID',
  'SHARE_NOT_FOUND',
  'SHARE_STORE_FAILED',
  'SHARE_LOAD_FAILED',
  'RATE_LIMIT_EXCEEDED',
  'BUDGET_EXCEEDED',
  'UPSTREAM_OPENAI_ERROR',
  'AI_OUTPUT_TRUNCATED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
  'ADMIN_REQUIRED',
  'WORKSPACE_ACCESS_DENIED',
  'WORKSPACE_MIGRATION_INVALID',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiMeta = typeof ApiMetaSchema.Type;

export type ApiErrorPayload = {
  error: string;
  code?: ApiErrorCode;
  requestId?: string;
};

export type WorkspaceMigrationResponse = typeof WorkspaceMigrationResponseSchema.Type;
export type WorkspaceMigrationResult = Omit<WorkspaceMigrationResponse, 'meta'>;
export type WorkspaceMigrationConflict = WorkspaceMigrationResult['conflicts'][number];
export type CurrentWorkspaceResponseWithMeta = typeof CurrentWorkspaceResponseSchema.Type;

export type MeApiResponse =
  | {
      signedIn: false;
      user: null;
      meta?: ApiMeta;
    }
  | {
      signedIn: true;
      user: {
        userId: string;
        email: string;
        emailVerified: boolean;
        name: string;
      };
      meta?: ApiMeta;
    };
