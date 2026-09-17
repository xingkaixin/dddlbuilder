import * as Schema from 'effect/Schema';

const finite = Schema.Number.check(Schema.isFinite());
const base = {
  tableKey: Schema.String,
  field: Schema.String,
  nullPercent: finite.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
};
export const SeedRuleSchema = Schema.Union([
  Schema.Struct({ ...base, kind: Schema.Literal('default') }),
  Schema.Struct({ ...base, kind: Schema.Literal('range'), min: Schema.String, max: Schema.String }),
  Schema.Struct({
    ...base,
    kind: Schema.Literal('weighted'),
    values: Schema.Array(
      Schema.Struct({ value: Schema.String, weight: finite.check(Schema.isGreaterThan(0)) }),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  }),
  Schema.Struct({
    ...base,
    kind: Schema.Literal('date'),
    start: Schema.String,
    end: Schema.String,
  }),
  Schema.Struct({
    ...base,
    kind: Schema.Literal('offset'),
    source: Schema.String,
    days: finite.check(Schema.isInt(), Schema.isBetween({ minimum: -36500, maximum: 36500 })),
  }),
]);

export type SeedRule = typeof SeedRuleSchema.Type;

export const SeedScenarioSchema = Schema.Struct({
  version: Schema.Literal(1),
  name: Schema.String.check(Schema.isMaxLength(120)),
  seed: Schema.String.check(Schema.isMaxLength(200)),
  includeLogical: Schema.Boolean,
  rows: Schema.Array(
    Schema.Struct({
      tableKey: Schema.String,
      count: finite.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 1000 })),
    }),
  ).check(Schema.isMaxLength(200)),
  rules: Schema.Array(SeedRuleSchema).check(Schema.isMaxLength(1000)),
});

export type SeedScenario = typeof SeedScenarioSchema.Type;

export const decodeSeedScenario = Schema.decodeUnknownSync(SeedScenarioSchema);
