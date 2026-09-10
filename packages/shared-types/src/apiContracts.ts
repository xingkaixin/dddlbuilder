import * as Schema from 'effect/Schema';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { NormalizedField } from './fieldRow.js';
import { FIELD_DEFAULT_KINDS, FIELD_ON_UPDATES } from './fieldRow.js';
import type {
  ForeignKeyDefinition,
  IndexDefinition,
  MysqlPartitionConfig,
  TableMiscConfig,
} from './schema.js';
import { DATABASE_TYPES } from './database.js';

const strings = Schema.Array(Schema.String).pipe(Schema.mutable);
const optionalString = Schema.optional(Schema.String);
export const ApiMetaSchema = Schema.Struct({ requestId: optionalString });
const meta = Schema.optional(ApiMetaSchema);
const nonBlank = Schema.String.check(Schema.makeFilter((value) => value.trim().length > 0));
const count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
export const MAX_SQL_LENGTH = 50_000;
export const SqlParseRequestSchema = Schema.Struct({
  sql: nonBlank.check(Schema.isMaxLength(MAX_SQL_LENGTH)),
  dbType: Schema.Literals(DATABASE_TYPES.filter((type) => type !== 'hive')),
});
export const NormalizedFieldSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  comment: Schema.String,
  nullable: Schema.Boolean,
  defaultKind: Schema.Literals(FIELD_DEFAULT_KINDS),
  defaultValue: Schema.String,
  onUpdate: Schema.Literals(FIELD_ON_UPDATES),
  enumMeta: Schema.optional(
    Schema.Array(
      Schema.Struct({
        value: Schema.String,
        color: optionalString,
        i18n: Schema.optional(Schema.Record(Schema.String, Schema.String)),
      }),
    ).pipe(Schema.mutable),
  ),
}) satisfies Schema.ConstraintDecoder<NormalizedField>;
export const IndexDefinitionSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  fields: Schema.Array(
    Schema.Struct({ name: Schema.String, direction: Schema.Literals(['ASC', 'DESC']) }),
  ).pipe(Schema.mutable),
  kind: Schema.Literals(['index', 'unique_index', 'unique_constraint', 'primary']),
}) satisfies Schema.ConstraintDecoder<IndexDefinition>;
const action = Schema.optional(
  Schema.Literals(['CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION']),
);
export const ForeignKeyDefinitionSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  fields: strings,
  refSchema: optionalString,
  refTable: Schema.String,
  refFields: strings,
  onDelete: action,
  onUpdate: action,
  logical: Schema.optional(
    Schema.Struct({
      cardinality: Schema.Literals(['many-to-one', 'one-to-one']),
      optionality: Schema.Literals(['required', 'optional']),
      description: optionalString,
    }),
  ),
}) satisfies Schema.ConstraintDecoder<ForeignKeyDefinition>;
export const MysqlPartitionConfigSchema = Schema.Struct({
  enabled: Schema.Boolean,
  type: Schema.Literals(['RANGE', 'RANGE COLUMNS', 'LIST', 'LIST COLUMNS', 'HASH', 'KEY']),
  columns: strings,
  expression: optionalString,
  partitionCount: Schema.optional(Schema.Number),
  partitions: Schema.optional(
    Schema.Array(
      Schema.Struct({ id: Schema.String, name: Schema.String, value: Schema.String }),
    ).pipe(Schema.mutable),
  ),
}) satisfies Schema.ConstraintDecoder<MysqlPartitionConfig>;
export const TableMiscConfigSchema = Schema.Struct({
  enabled: Schema.Boolean,
  engine: optionalString,
  charset: optionalString,
  collation: optionalString,
  tablespace: optionalString,
  fillfactor: Schema.optional(Schema.Number),
  pctfree: Schema.optional(Schema.Number),
  initrans: Schema.optional(Schema.Number),
  storedAs: Schema.optional(Schema.Literals(['ORC', 'TEXTFILE', 'PARQUET', ''])),
  external: Schema.optional(Schema.Boolean),
  location: optionalString,
  partitions: Schema.optional(
    Schema.Struct({
      enabled: Schema.Boolean,
      columns: Schema.Array(
        Schema.Struct({ name: Schema.String, type: Schema.String, comment: Schema.String }),
      ).pipe(Schema.mutable),
      clustering: Schema.optional(
        Schema.Struct({ enabled: Schema.Boolean, columns: strings, bucketCount: Schema.Number }),
      ),
    }),
  ),
}) satisfies Schema.ConstraintDecoder<TableMiscConfig>;
export const ParsedResultSchema = Schema.Struct({
  schemaName: optionalString,
  tableName: Schema.String,
  tableComment: Schema.String,
  fields: Schema.Array(NormalizedFieldSchema).pipe(Schema.mutable),
  indexes: Schema.Array(IndexDefinitionSchema).pipe(Schema.mutable),
  foreignKeys: Schema.Array(ForeignKeyDefinitionSchema).pipe(Schema.mutable),
  authObjects: strings,
  tableMiscConfig: Schema.optional(TableMiscConfigSchema),
  mysqlPartitionConfig: Schema.optional(MysqlPartitionConfigSchema),
});
export const SqlParseResponseSchema = Schema.Struct({ result: ParsedResultSchema, meta });
export const MultiSqlParseResponseSchema = Schema.Struct({
  results: Schema.Array(ParsedResultSchema).pipe(Schema.mutable),
  failed: Schema.Array(Schema.Struct({ statement: Schema.String, error: Schema.String })).pipe(
    Schema.mutable,
  ),
  meta,
});
export const CreateShareResponseSchema = Schema.Struct({
  id: nonBlank,
  url: nonBlank,
  expiresInSeconds: count,
  meta,
});
export const GetShareResponseSchema = Schema.Struct({
  id: nonBlank,
  state: Schema.Record(Schema.String, Schema.Unknown),
  meta,
});
export const CurrentWorkspaceResponseSchema = Schema.Struct({ workspaceId: nonBlank, meta });
export const WorkspaceMigrationResponseSchema = Schema.Struct({
  status: Schema.Literals(['no_data', 'ready', 'completed']),
  createdCount: count,
  copiedCount: count,
  skippedCount: count,
  conflictCount: count,
  conflicts: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(['draft', 'saved_table', 'saved_draft', 'folder']),
      normalizedName: Schema.NullOr(Schema.String),
      displayName: Schema.String,
    }),
  ).pipe(Schema.mutable),
  meta,
});
export const decodeSqlParseResponse = Schema.decodeUnknownOption(SqlParseResponseSchema);
export const decodeMultiSqlParseResponse = Schema.decodeUnknownOption(MultiSqlParseResponseSchema);
export const decodeCreateShareResponse = Schema.decodeUnknownOption(CreateShareResponseSchema);
export const decodeGetShareResponse = Schema.decodeUnknownOption(GetShareResponseSchema);
export const decodeCurrentWorkspaceResponse = Schema.decodeUnknownOption(
  CurrentWorkspaceResponseSchema,
);
export const decodeWorkspaceMigrationResponse = Schema.decodeUnknownOption(
  WorkspaceMigrationResponseSchema,
);

const errorText = Schema.String.pipe(
  Schema.catchDecoding(() => Effect.succeed(Option.none())),
  Schema.optional,
);
const apiError = Schema.decodeUnknownOption(
  Schema.Struct({ error: errorText, code: errorText, requestId: errorText }),
);
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this decoder is the API error boundary.
export const decodeApiError = (input: unknown) =>
  Option.getOrElse(apiError(input), () => ({
    error: undefined,
    code: undefined,
    requestId: undefined,
  }));

export const WorkspaceMigrationRequestSchema = Schema.Struct({
  mode: Schema.Literals(['analyze', 'commit']),
  payload: Schema.optional(Schema.Unknown),
});
