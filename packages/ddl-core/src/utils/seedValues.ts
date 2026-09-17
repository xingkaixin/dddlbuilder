import type { FieldRow } from '@ddlbuilder/shared-types';
import { parseFieldType, getCanonicalBaseType } from './databaseTypeMapping.js';

export type SeedValue = string | number | boolean | null;

export type SeedRow = Record<string, SeedValue>;

export interface SeedColumn {
  field: FieldRow;
  numeric: boolean;
  generate: (ordinal: number) => SeedValue;
}

export function seedHash(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index++)
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);

  return hash >>> 0;
}

export function seedRandom(seed: string): () => number {
  let state = seedHash(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeedColumn(field: FieldRow, seed: string): SeedColumn {
  if (/\b(?:check|generated|references|collate)\b/i.test(field.fieldType))
    throw new Error(
      `${field.fieldName}: move constraints out of the type before generating test data.`,
    );
  const parsed = parseFieldType(field.fieldType);
  const type = getCanonicalBaseType(parsed.baseType);
  const offset = seedHash(`${seed}:${field.fieldName}`);

  const integerBits = new Map([
    ['tinyint', 8],
    ['smallint', 16],
    ['mediumint', 24],
    ['int', 32],
    ['bigint', 64],
    ['smallserial', 16],
    ['serial', 32],
    ['bigserial', 64],
  ]);
  const bits = integerBits.get(type);
  let numeric = false;
  let generate: SeedColumn['generate'];

  if (bits) {
    numeric = true;
    const max = (1n << BigInt(bits - (parsed.unsigned ? 0 : 1))) - 1n;
    generate = (ordinal) => {
      const value = ((BigInt(offset) + BigInt(ordinal)) % max) + 1n;

      return bits === 64 ? value.toString() : Number(value);
    };
  } else if (type === 'decimal' || type === 'numeric' || type === 'number') {
    numeric = true;
    const precision = Number(parsed.args[0] ?? 18);
    const scale = Number(parsed.args[1] ?? 0);

    if (
      !Number.isInteger(precision) ||
      precision < 1 ||
      precision > 65 ||
      !Number.isInteger(scale) ||
      scale < 0 ||
      scale > precision
    )
      throw new Error(`${field.fieldName}: unsupported decimal precision or scale.`);
    const modulus = 10n ** BigInt(precision);
    generate = (ordinal) => {
      const digits = ((BigInt(offset) + BigInt(ordinal)) % modulus)
        .toString()
        .padStart(scale + 1, '0');

      return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
    };
  } else if (['float', 'double', 'real'].includes(type)) {
    numeric = true;
    generate = (ordinal) => ((offset % 100_000) + ordinal) / 100;
  } else if (['bool', 'boolean'].includes(type)) {
    generate = (ordinal) => (ordinal + offset) % 2 === 0;
  } else if (
    [
      'varchar',
      'nvarchar',
      'char',
      'nchar',
      'text',
      'tinytext',
      'mediumtext',
      'longtext',
      'clob',
    ].includes(type)
  ) {
    const length = Number(parsed.args[0] ?? (type === 'char' || type === 'nchar' ? 1 : 64));

    if (!Number.isInteger(length) || length < 1 || length > 1_000_000)
      throw new Error(`${field.fieldName}: unsupported character length.`);
    generate = (ordinal) => {
      const token = (offset + ordinal).toString(36).padStart(Math.min(length, 8), '0');

      return `${token.slice(-Math.min(length, 8))}_${field.fieldName}`.slice(
        0,
        Math.min(length, 64),
      );
    };
  } else if (type === 'enum') {
    const values = parsed.args
      .map((value) => value.trim())
      .map((value) => {
        if (!/^'(?:[^']|'')*'$/.test(value) || value.includes('\\'))
          throw new Error(`${field.fieldName}: unsupported ENUM literal.`);

        return value.slice(1, -1).replaceAll("''", "'");
      });

    if (!values.length) throw new Error(`${field.fieldName}: ENUM has no values.`);
    generate = (ordinal) => values[(offset + ordinal) % values.length];
  } else if (
    type === 'date' ||
    ['datetime', 'timestamp', 'timestamptz', 'time', 'timetz'].includes(type)
  ) {
    generate = (ordinal) => {
      const date = new Date(
        Date.UTC(2024, 0, 1) +
          ((offset % (type === 'date' ? 365 : 1_000_000)) + ordinal) *
            (type === 'date' ? 86_400_000 : 1000),
      ).toISOString();

      if (type === 'date') return date.slice(0, 10);
      if (type === 'time' || type === 'timetz') return date.slice(11, 19);

      return date.slice(0, 19).replace('T', ' ');
    };
  } else if (type === 'uuid' || type === 'uniqueidentifier') {
    generate = (ordinal) => {
      const hex = Array.from({ length: 4 }, (_, index) =>
        seedHash(`${seed}:${field.fieldName}:${ordinal}:${index}`).toString(16).padStart(8, '0'),
      ).join('');

      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
    };
  } else if (type === 'json' || type === 'jsonb') {
    generate = (ordinal) => JSON.stringify({ sample: offset + ordinal });
  } else {
    throw new Error(`${field.fieldName}: unsupported test-data type ${field.fieldType}.`);
  }

  if (field.enumMeta?.length) {
    const values = field.enumMeta.map((entry) => entry.value);

    if (values.some((value) => value.includes('\0')))
      throw new Error(`${field.fieldName}: enum values cannot contain a null character.`);

    if (numeric) {
      for (const value of values) {
        if (!/^-?\d+(?:\.\d+)?$/.test(value))
          throw new Error(`${field.fieldName}: enum value is not numeric: ${value}`);

        if (!Number.isFinite(Number(value)))
          throw new Error(`${field.fieldName}: enum value is outside the supported numeric range.`);

        if (parsed.unsigned && value.startsWith('-') && Number(value) !== 0)
          throw new Error(
            `${field.fieldName}: enum value cannot be negative for an unsigned column.`,
          );

        if (bits) {
          if (!/^-?\d+$/.test(value))
            throw new Error(`${field.fieldName}: enum value is not an integer.`);
          const lower = parsed.unsigned ? 0n : -(1n << BigInt(bits - 1));
          const upper = (1n << BigInt(bits - (parsed.unsigned ? 0 : 1))) - 1n;

          if (BigInt(value) < lower || BigInt(value) > upper)
            throw new Error(`${field.fieldName}: enum value exceeds the integer range.`);
        } else if (['decimal', 'numeric', 'number'].includes(type)) {
          const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
          const precision = Number(parsed.args[0] ?? 18);
          const scale = Number(parsed.args[1] ?? 0);

          if (whole.replace(/^0+/, '').length > precision - scale || fraction.length > scale)
            throw new Error(`${field.fieldName}: enum value exceeds decimal precision.`);
        }
      }
    } else if (
      ![
        'varchar',
        'nvarchar',
        'char',
        'nchar',
        'text',
        'tinytext',
        'mediumtext',
        'longtext',
        'clob',
        'enum',
      ].includes(type)
    ) {
      throw new Error(`${field.fieldName}: logical enums require a numeric or character column.`);
    } else {
      const length = Number(parsed.args[0] ?? (type === 'char' || type === 'nchar' ? 1 : NaN));

      if (
        type !== 'enum' &&
        Number.isFinite(length) &&
        values.some((value) => Array.from(value).length > length)
      )
        throw new Error(`${field.fieldName}: enum value exceeds character length.`);

      if (
        type === 'enum' &&
        values.some(
          (value) =>
            !parsed.args.some((argument) => argument.slice(1, -1).replaceAll("''", "'") === value),
        )
      )
        throw new Error(`${field.fieldName}: logical enum is outside the database ENUM.`);
    }

    generate = (ordinal) => {
      const value = values[(offset + ordinal) % values.length];

      if (!numeric) return value;
      const [whole, fraction = ''] = value.split('.');
      const decimals = fraction.replace(/0+$/, '');
      const integer = BigInt(whole.replace(/^-/, '')).toString();
      const sign = value.startsWith('-') && (integer !== '0' || decimals) ? '-' : '';
      const normalized = `${sign}${integer}${decimals ? `.${decimals}` : ''}`;

      return normalized;
    };
  }

  return { field, numeric, generate };
}
