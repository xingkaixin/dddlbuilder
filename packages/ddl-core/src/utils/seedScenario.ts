import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SeedRule } from '@ddlbuilder/shared-types/api';
import { createSeedColumn, seedRandom, type SeedRow, type SeedValue } from './seedValues.js';
import { parseFieldType, getCanonicalBaseType } from './databaseTypeMapping.js';
import { getSqlIdentifierKey } from './sqlIdentifiers.js';
import { snapshotTableKey } from './schemaSnapshot.js';

const day = 86400000;

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use dates in YYYY-MM-DD format.');
  const time = Date.parse(`${value}T00:00:00Z`);

  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value)
    throw new Error(`Invalid date: ${value}`);

  return time;
}

export function compileSeedScenario(
  table: PersistedState,
  rules: readonly SeedRule[],
  seed: string,
  includeLogical: boolean,
) {
  const selected = rules.filter((rule) => rule.tableKey === snapshotTableKey(table));
  const fields = new Map(table.rows.map((field) => [field.fieldName, field]));
  const byName = new Map(selected.map((rule) => [rule.field, rule]));

  if (byName.size !== selected.length)
    throw new Error(`${table.tableName}: duplicate scenario rules.`);

  const identifier = (name: string) => getSqlIdentifierKey(name, table.dbType);

  const foreign = new Set(
    (table.foreignKeys ?? [])
      .filter((relation) => !relation.logical || includeLogical)
      .flatMap((relation) => relation.fields.map(identifier)),
  );
  const primary = new Set(
    table.indexes
      .filter((index) => index.kind === 'primary')
      .flatMap((index) => index.fields.map((field) => identifier(field.name))),
  );
  const ordered: SeedRule[] = [];
  const pending = new Map(byName);

  while (pending.size) {
    const ready = [...pending.values()].filter(
      (rule) => rule.kind !== 'offset' || !pending.has(rule.source),
    );

    if (!ready.length) throw new Error(`${table.tableName}: cyclic date rules.`);

    for (const rule of ready) {
      ordered.push(rule);
      pending.delete(rule.field);
    }
  }

  const generators = ordered.map((rule) => {
    const field = fields.get(rule.field);

    if (!field) throw new Error(`${table.tableName}.${rule.field}: scenario field is missing.`);

    if (foreign.has(identifier(field.fieldName)))
      throw new Error(`${field.fieldName}: foreign-key values are generated from parent rows.`);

    if (rule.nullPercent > 0 && (!field.nullable || primary.has(identifier(field.fieldName))))
      throw new Error(`${field.fieldName}: NULL is not permitted.`);
    const parsed = parseFieldType(field.fieldType);
    const type = getCanonicalBaseType(parsed.baseType);
    const column = createSeedColumn(field, `${seed}:${snapshotTableKey(table)}`);

    let generate: (row: SeedRow, ordinal: number, random: () => number) => SeedValue = (
      _row,
      ordinal,
    ) => column.generate(ordinal);

    if (rule.kind === 'weighted') {
      const allowed = field.enumMeta?.map((entry) => entry.value);

      if (allowed && rule.values.some((entry) => !allowed.includes(entry.value)))
        throw new Error(`${field.fieldName}: weights must use existing enumeration values.`);
      createSeedColumn(
        { ...field, enumMeta: rule.values.map((entry) => ({ value: entry.value })) },
        seed,
      );
      const total = rule.values.reduce((sum, entry) => sum + entry.weight, 0);

      if (!Number.isFinite(total) || total <= 0)
        throw new Error(`${field.fieldName}: invalid weights.`);
      generate = (_row, _ordinal, random) => {
        let remaining = random() * total;

        for (const entry of rule.values) {
          remaining -= entry.weight;

          if (remaining < 0) return entry.value;
        }

        return rule.values[rule.values.length - 1].value;
      };
    } else if (rule.kind === 'range') {
      if (field.enumMeta?.length)
        throw new Error(`${field.fieldName}: use weights for an enumerated field.`);

      const integer = /^(tinyint|smallint|mediumint|int|bigint|smallserial|serial|bigserial)$/.test(
        type,
      );

      if (!integer && !['decimal', 'numeric', 'number'].includes(type))
        throw new Error(`${field.fieldName}: ranges require an integer or decimal field.`);
      createSeedColumn({ ...field, enumMeta: [{ value: rule.min }, { value: rule.max }] }, seed);
      const scale = integer ? 0 : Number(parsed.args[1] ?? 0);

      const units = (value: string) => {
        const negative = value.startsWith('-');
        const [whole, fraction = ''] = value.replace(/^-/, '').split('.');

        return BigInt(whole + fraction.padEnd(scale, '0')) * (negative ? -1n : 1n);
      };
      const min = units(rule.min);
      const max = units(rule.max);

      if (min > max || max - min > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error(
          `${field.fieldName}: use an ordered range spanning at most MAX_SAFE_INTEGER units.`,
        );
      generate = (_row, _ordinal, random) => {
        const value = min + BigInt(Math.floor(random() * (Number(max - min) + 1)));
        const digits = (value < 0 ? -value : value).toString().padStart(scale + 1, '0');

        return `${value < 0 ? '-' : ''}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`;
      };
    } else if (rule.kind === 'date' || rule.kind === 'offset') {
      if (!['date', 'datetime', 'timestamp', 'timestamptz'].includes(type))
        throw new Error(`${field.fieldName}: date rules require a date or timestamp field.`);

      const format = (time: number) => {
        const value = new Date(time).toISOString();

        if (value.length !== 24 || value.slice(0, 4) < '1000')
          throw new Error(`${field.fieldName}: date is outside the supported range.`);

        return type === 'date' ? value.slice(0, 10) : value.slice(0, 19).replace('T', ' ');
      };

      if (rule.kind === 'date') {
        const start = dateValue(rule.start);
        const end = dateValue(rule.end);

        if (start > end) throw new Error(`${field.fieldName}: date range is reversed.`);
        generate = (_row, _ordinal, random) =>
          format(start + Math.floor(random() * ((end - start) / day + 1)) * day);
      } else {
        const source = fields.get(rule.source);

        if (
          !source ||
          !['date', 'datetime', 'timestamp', 'timestamptz'].includes(
            getCanonicalBaseType(parseFieldType(source.fieldType).baseType),
          )
        )
          throw new Error(`${field.fieldName}: date source is missing or incompatible.`);
        generate = (row) => {
          const value = row[rule.source];

          if (value == null) {
            if (field.nullable && !primary.has(identifier(field.fieldName))) return null;
            throw new Error(`${field.fieldName}: source date is NULL.`);
          }

          return format(
            Date.parse(
              `${String(value).replace(' ', 'T')}${String(value).length === 10 ? 'T00:00:00' : ''}Z`,
            ) +
              rule.days * day,
          );
        };
      }
    }

    return { field: field.fieldName, rule, generate };
  });

  return (row: SeedRow, ordinal: number) => {
    for (const generator of generators) {
      const random = seedRandom(`${seed}:${snapshotTableKey(table)}:${generator.field}:${ordinal}`);
      row[generator.field] =
        random() * 100 < generator.rule.nullPercent
          ? null
          : generator.generate(row, ordinal, random);
    }
  };
}
