import {
  utf8Length,
  type DataDateFormat,
  type DataImportDialect,
  type DataImportIssueCode,
} from './types.js';

type ImportType =
  | { kind: 'integer'; min: bigint; max: bigint }
  | { kind: 'decimal'; precision: number; scale: number; unsigned: boolean }
  | { kind: 'text'; length: number; bytes: number }
  | { kind: 'enum'; values: string[] }
  | { kind: 'float'; single: boolean }
  | { kind: 'boolean' | 'date' | 'uuid' | 'json' }
  | { kind: 'datetime'; precision: number };

export function parseImportType(type: string, dialect: DataImportDialect): ImportType | null {
  const normalized = type.trim().toLowerCase().replace(/\s+/g, ' ');

  const integer = normalized.match(
    /^(tinyint|smallint|mediumint|int|integer|bigint|smallserial|serial|bigserial)(?:\(\d+\))?( unsigned)?$/,
  );

  if (integer) {
    if (
      dialect === 'postgresql' &&
      (integer[2] || /^(tinyint|mediumint)/.test(normalized) || normalized.includes('('))
    )
      return null;
    if (dialect === 'mysql' && integer[1].includes('serial')) return null;

    const bits =
      integer[1] === 'tinyint'
        ? 8
        : ['smallint', 'smallserial'].includes(integer[1])
          ? 16
          : integer[1] === 'mediumint'
            ? 24
            : ['bigint', 'bigserial'].includes(integer[1])
              ? 64
              : 32;

    return {
      kind: 'integer',
      min: integer[2] ? 0n : -(1n << BigInt(bits - 1)),
      max: (1n << BigInt(bits - (integer[2] ? 0 : 1))) - 1n,
    };
  }

  const decimal = normalized.match(
    /^(?:decimal|numeric)(?:\((\d+)(?:\s*,\s*(\d+))?\))?( unsigned)?$/,
  );

  if (decimal) {
    if (dialect === 'postgresql' && (decimal[3] || !decimal[1])) return null;
    const precision = Number(decimal[1] ?? 10);
    const scale = Number(decimal[2] ?? 0);

    return precision >= 1 &&
      precision <= (dialect === 'mysql' ? 65 : 1000) &&
      scale <= precision &&
      (dialect !== 'mysql' || scale <= 30)
      ? { kind: 'decimal', precision, scale, unsigned: Boolean(decimal[3]) }
      : null;
  }

  const character = normalized.match(/^(char|varchar|character varying|character)(?:\((\d+)\))?$/);

  if (character) {
    const length = Number(character[2] ?? (['char', 'character'].includes(character[1]) ? 1 : NaN));

    return Number.isInteger(length) && length > 0 && length <= 65535
      ? { kind: 'text', length, bytes: Infinity }
      : null;
  }

  if (['text', 'tinytext', 'mediumtext', 'longtext'].includes(normalized)) {
    if (dialect === 'postgresql' && normalized !== 'text') return null;

    return {
      kind: 'text',
      length: Infinity,
      bytes:
        normalized === 'tinytext'
          ? 255
          : normalized === 'text' && dialect === 'mysql'
            ? 65535
            : Infinity,
    };
  }

  if (
    dialect === 'mysql' &&
    /^enum\(\s*'(?:[^'\\]|'')*'(?:\s*,\s*'(?:[^'\\]|'')*')*\s*\)$/i.test(type.trim())
  ) {
    return {
      kind: 'enum',
      values: [...type.matchAll(/'((?:[^'\\]|'')*)'/g)].map((match) =>
        match[1].replaceAll("''", "'"),
      ),
    };
  }

  if (['float', 'double', 'double precision', 'real'].includes(normalized))
    return (dialect === 'postgresql' && normalized === 'double') ||
      (dialect === 'mysql' && normalized === 'real')
      ? null
      : {
          kind: 'float',
          single: normalized === 'real' || (dialect === 'mysql' && normalized === 'float'),
        };
  if (['boolean', 'bool'].includes(normalized)) return { kind: 'boolean' };
  if (normalized === 'date') return { kind: 'date' };
  if (normalized === 'uuid' && dialect === 'postgresql') return { kind: 'uuid' };
  if (normalized === 'json' || (normalized === 'jsonb' && dialect === 'postgresql'))
    return { kind: 'json' };

  const datetime = normalized.match(
    /^(timestamp|datetime)(?:\(([0-6])\))?(?: without time zone)?$/,
  );

  if (
    datetime &&
    !(dialect === 'postgresql' && datetime[1] === 'datetime') &&
    !(dialect === 'mysql' && normalized.includes('without time zone'))
  )
    return {
      kind: 'datetime',
      precision: Number(datetime[2] ?? (dialect === 'postgresql' ? 6 : 0)),
    };

  return null;
}

export function normalizeImportDate(value: string, format: DataDateFormat): string | null {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  const regional = format !== 'iso' && value.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);

  if (!iso && !regional) return null;
  const year = Number(iso ? iso[1] : regional && regional[3]);
  const month = Number(iso ? iso[2] : regional && regional[format === 'dmy' ? 2 : 1]);
  const day = Number(iso ? iso[3] : regional && regional[format === 'dmy' ? 1 : 2]);

  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (day > days[month - 1]) return null;
  const rest = iso ? iso[4] : regional ? regional[4] : '';

  if (rest && !/^[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/.test(rest)) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}${rest.replace('T', ' ')}`;
}

function normalizedDecimal(value: string): string {
  const [whole, fraction = ''] = value.replace(/^[+-]/, '').split('.');
  const digits = BigInt(whole).toString();
  const tail = fraction.replace(/0+$/, '');
  const sign = value.startsWith('-') && (digits !== '0' || tail) ? '-' : '';

  return `${sign}${digits}${tail ? `.${tail}` : ''}`;
}

export function checkImportValue(
  value: string,
  type: ImportType,
  format: DataDateFormat,
): { value: string; numeric: boolean } | DataImportIssueCode {
  if (
    value.includes('\0') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
  )
    return 'nullCharacter';

  switch (type.kind) {
    case 'integer': {
      if (!/^[+-]?\d+$/.test(value)) return 'value';
      const integer = BigInt(value);

      return integer < type.min || integer > type.max
        ? 'range'
        : { value: integer.toString(), numeric: true };
    }

    case 'decimal': {
      if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) return 'value';
      const [whole, fraction = ''] = value.replace(/^[+-]/, '').split('.');

      if (
        whole.replace(/^0+/, '').length > type.precision - type.scale ||
        fraction.length > type.scale
      )
        return 'precision';
      const normalized = normalizedDecimal(value);

      return type.unsigned && normalized.startsWith('-')
        ? 'range'
        : { value: normalized, numeric: true };
    }

    case 'float': {
      if (!/^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) return 'value';
      const parsed = Number(value);
      const rounded = type.single ? Math.fround(parsed) : parsed;
      const nonzero = /[1-9]/.test(value.split(/e/i)[0]);

      if (!Number.isFinite(rounded) || (rounded === 0 && nonzero)) return 'range';

      return { value: String(rounded), numeric: true };
    }

    case 'text':
      return Array.from(value).length > type.length || utf8Length(value) > type.bytes
        ? 'length'
        : { value, numeric: false };
    case 'enum':
      return type.values.includes(value) ? { value, numeric: false } : 'enum';
    case 'boolean':
      return /^(true|false|0|1)$/i.test(value)
        ? { value: /^(true|1)$/i.test(value) ? 'TRUE' : 'FALSE', numeric: true }
        : 'value';
    case 'date':
    case 'datetime': {
      const date = normalizeImportDate(value, format);

      if (!date || (type.kind === 'date' && date.length !== 10)) return 'value';
      if (type.kind === 'datetime' && (date.split('.')[1]?.length ?? 0) > type.precision)
        return 'precision';

      return {
        value: type.kind === 'datetime' && date.length === 10 ? `${date} 00:00:00` : date,
        numeric: false,
      };
    }

    case 'uuid':
      return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
        ? { value: value.toLowerCase(), numeric: false }
        : 'value';
    case 'json':
      try {
        JSON.parse(value);

        return { value, numeric: false };
      } catch {
        return 'value';
      }
  }
}

export function importStringLiteral(value: string, dialect: DataImportDialect): string {
  if (dialect === 'mysql') {
    const hex = encodeURIComponent(value).replace(
      /%([0-9a-f]{2})|([^%])/gi,
      (_match, byte: string | undefined, literal: string) =>
        byte ?? literal.charCodeAt(0).toString(16).padStart(2, '0'),
    );

    return `_utf8mb4 X'${hex.toLowerCase()}'`;
  }

  return `E'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}
