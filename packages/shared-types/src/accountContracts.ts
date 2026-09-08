import * as SchemaGetter from 'effect/SchemaGetter';
import * as Schema from 'effect/Schema';
import { ApiMetaSchema } from './apiContracts.js';

const meta = Schema.optional(ApiMetaSchema);
const count = Schema.Number.check(
  Schema.makeFilter((value) => Number.isSafeInteger(value) && value >= 0),
);
const text = Schema.String;
const id = text.check(Schema.isNonEmpty());
const timestamp = text.check(Schema.makeFilter((value) => Number.isFinite(Date.parse(value))));
export const MeResponseSchema = Schema.Union([
  Schema.Struct({ signedIn: Schema.Literal(false), user: Schema.Null, meta }),
  Schema.Struct({
    signedIn: Schema.Literal(true),
    user: Schema.Struct({ userId: id, email: text, emailVerified: Schema.Boolean, name: text }),
    meta,
  }),
]);
export const CreditBalanceResponseSchema = Schema.Struct({
  balance: count,
  version: count,
  userId: id,
  meta,
});
export const CreditLedgerItemSchema = Schema.Struct({
  id,
  userId: id,
  kind: Schema.Literals(['grant', 'consume', 'refund']),
  source: Schema.Literals([
    'signup_bonus',
    'ai_generate',
    'ai_review',
    'ai_explain',
    'manual_adjustment',
  ]),
  amount: count,
  balanceAfter: count,
  idempotencyKey: text,
  relatedUsageId: Schema.NullOr(text),
  metadataJson: Schema.NullOr(text),
  createdAt: timestamp,
});
export const CreditLedgerResponseSchema = Schema.Struct({
  items: Schema.Array(CreditLedgerItemSchema).pipe(Schema.mutable),
  total: count,
  limit: count,
  offset: count,
  meta,
});
export const AdminUserSummarySchema = Schema.Struct({
  id,
  name: text,
  email: text,
  emailVerified: Schema.Boolean,
  balance: count,
  createdAt: timestamp,
  disabled: Schema.Boolean,
});
export const AdminUserDetailSchema = Schema.Struct({
  ...AdminUserSummarySchema.fields,
  updatedAt: timestamp,
  lastActiveAt: Schema.NullOr(timestamp),
});
export const AdminUsageEventSchema = Schema.Struct({
  id,
  routeKey: text,
  requestId: text,
  estimatedTokens: count,
  actualTotalTokens: Schema.NullOr(count),
  chargedTokens: Schema.NullOr(count),
  providerBudgetTokens: Schema.NullOr(count),
  attemptCount: Schema.NullOr(count),
  usageEstimated: Schema.NullOr(Schema.Boolean),
  status: text,
  errorCode: Schema.NullOr(text),
  createdAt: timestamp,
});
export const AdminUsersResponseSchema = Schema.Struct({
  users: Schema.Array(AdminUserSummarySchema).pipe(Schema.mutable),
  meta,
});
export const AdminUserResponseSchema = Schema.Struct({ user: AdminUserDetailSchema, meta });
export const AdminLedgerResponseSchema = Schema.Struct({
  items: Schema.Array(CreditLedgerItemSchema).pipe(Schema.mutable),
  meta,
});
export const AdminUsageResponseSchema = Schema.Struct({
  items: Schema.Array(AdminUsageEventSchema).pipe(Schema.mutable),
  total: count,
  meta,
});
export const AdminSessionResponseSchema = Schema.Struct({ authenticated: Schema.Boolean });
export const AdminActionResponseSchema = Schema.Struct({ ok: Schema.Literal(true), meta });
export const AdminEmailVerificationResponseSchema = Schema.Struct({
  ...AdminActionResponseSchema.fields,
  emailVerified: Schema.Boolean,
});
export const AdminCreditGrantResponseSchema = Schema.Struct({
  ...AdminActionResponseSchema.fields,
  newBalance: count,
});
export const AdminLoginRequestSchema = Schema.Struct({
  password: Schema.Trim.check(Schema.isNonEmpty()),
});
export const AdminDisableRequestSchema = Schema.Struct({ reason: Schema.optional(text) });
export const AdminEmailVerificationRequestSchema = Schema.Struct({ verified: Schema.Boolean });
export const AdminCreditGrantRequestSchema = Schema.Struct({
  amount: count.check(Schema.isGreaterThan(0)),
  note: Schema.optional(text),
});
export const decodeMeResponse = Schema.decodeUnknownOption(MeResponseSchema);
export const decodeCreditBalanceResponse = Schema.decodeUnknownOption(CreditBalanceResponseSchema);
export const decodeCreditLedgerResponse = Schema.decodeUnknownOption(CreditLedgerResponseSchema);
export const decodeAdminUsersResponse = Schema.decodeUnknownOption(AdminUsersResponseSchema);
export const decodeAdminUserResponse = Schema.decodeUnknownOption(AdminUserResponseSchema);
export const decodeAdminLedgerResponse = Schema.decodeUnknownOption(AdminLedgerResponseSchema);
export const decodeAdminUsageResponse = Schema.decodeUnknownOption(AdminUsageResponseSchema);
export const decodeAdminSessionResponse = Schema.decodeUnknownOption(AdminSessionResponseSchema);
export const decodeAdminActionResponse = Schema.decodeUnknownOption(AdminActionResponseSchema);
export const decodeAdminEmailVerificationResponse = Schema.decodeUnknownOption(
  AdminEmailVerificationResponseSchema,
);
export const decodeAdminCreditGrantResponse = Schema.decodeUnknownOption(
  AdminCreditGrantResponseSchema,
);
export type AdminUserSummary = typeof AdminUserSummarySchema.Type;
export type AdminUserDetail = typeof AdminUserDetailSchema.Type;
export type AdminUsageEvent = typeof AdminUsageEventSchema.Type;
export type CreditLedgerItem = typeof CreditLedgerItemSchema.Type;

const paginationInput = Schema.Struct({
  limit: Schema.optional(text),
  offset: Schema.optional(text),
});
const pagination = Schema.Struct({ limit: count, offset: count });
const adminPaginationQuery = (defaultLimit: number) =>
  paginationInput.pipe(
    Schema.decodeTo(pagination, {
      decode: SchemaGetter.transform((query) => ({
        limit: Math.min(
          Math.max(Number.parseInt(query.limit ?? String(defaultLimit), 10) || defaultLimit, 1),
          100,
        ),
        offset: Math.max(Number.parseInt(query.offset ?? '0', 10) || 0, 0),
      })),
      encode: SchemaGetter.transform((query) => ({
        limit: String(query.limit),
        offset: String(query.offset),
      })),
    }),
  );
export const AdminPaginationQuerySchema = adminPaginationQuery(50);
export const AdminLedgerQuerySchema = adminPaginationQuery(20);
const queryDate = (value: string | undefined) => {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
};
export const CreditLedgerQuerySchema = Schema.Struct({
  ...paginationInput.fields,
  startAt: Schema.optional(text),
  endAt: Schema.optional(text),
}).pipe(
  Schema.decodeTo(
    Schema.Struct({
      ...pagination.fields,
      startDate: Schema.optional(Schema.Number),
      endDate: Schema.optional(Schema.Number),
    }),
    {
      decode: SchemaGetter.transform((query) => {
        const limit = Number.parseInt(query.limit ?? '20', 10);
        const offset = Number.parseInt(query.offset ?? '0', 10);
        return {
          limit: !Number.isFinite(limit) || limit <= 0 ? 20 : Math.min(limit, 50),
          offset: !Number.isFinite(offset) || offset < 0 ? 0 : offset,
          startDate: queryDate(query.startAt),
          endDate: queryDate(query.endAt),
        };
      }),
      encode: SchemaGetter.transform((query) => ({
        limit: String(query.limit),
        offset: String(query.offset),
        startAt:
          query.startDate === undefined ? undefined : new Date(query.startDate).toISOString(),
        endAt: query.endDate === undefined ? undefined : new Date(query.endDate).toISOString(),
      })),
    },
  ),
);
