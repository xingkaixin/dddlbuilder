import {
  dataImportValue,
  isDataImportName,
  type BusinessData,
  type DataImportColumn,
  type DataImportDialect,
  type DataImportOptions,
} from './types.js';
import { normalizeImportDate } from './values.js';

export function inferDataImportColumns(
  data: BusinessData,
  dialect: DataImportDialect,
  options: DataImportOptions,
): DataImportColumn[] {
  const usedNames = new Set<string>();

  return data.headers.map((header, index) => {
    const values = data.rows.flatMap((row) => {
      const value = dataImportValue(row.values[index], options);

      return value === null ? [] : [value];
    });
    let name = isDataImportName(header, dialect) ? header : `column_${index + 1}`;

    while (usedNames.has(name.toLowerCase())) name = `${name}_`;
    usedNames.add(name.toLowerCase());

    return {
      source: header,
      name,
      type: inferType(values, dialect, options),
      nullable: values.length < data.rows.length,
    };
  });
}

function inferType(
  values: string[],
  dialect: DataImportDialect,
  options: DataImportOptions,
): string {
  if (!values.length) return 'text';
  if (values.every((value) => /^(true|false)$/i.test(value))) return 'boolean';

  if (values.every((value) => /^-?(?:0|[1-9]\d*)$/.test(value))) {
    const integers = values.map((value) => BigInt(value));

    if (integers.every((value) => value >= -2147483648n && value <= 2147483647n)) return 'int';
    if (integers.every((value) => value >= -9223372036854775808n && value <= 9223372036854775807n))
      return 'bigint';

    return 'text';
  }

  if (values.every((value) => /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))) {
    let digits = 1;
    let scale = 0;

    for (const value of values) {
      const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
      digits = Math.max(digits, whole.length);
      scale = Math.max(scale, fraction.length);
    }

    if (digits + scale <= 65 && scale <= 30) return `decimal(${digits + scale},${scale})`;
  }

  let allDates = true;
  let allDateOnly = true;
  let maxDatePrecision = 0;

  for (const value of values) {
    const normalized = normalizeImportDate(value, options.dateFormat);

    if (normalized === null) {
      allDates = false;
      break;
    }

    if (normalized.length !== 10) {
      allDateOnly = false;
      const dotIndex = normalized.indexOf('.');

      if (dotIndex >= 0) {
        maxDatePrecision = Math.max(maxDatePrecision, normalized.length - dotIndex - 1);
      }
    }
  }

  if (allDates) {
    if (allDateOnly) return 'date';

    return `${dialect === 'mysql' ? 'datetime' : 'timestamp'}${maxDatePrecision ? `(${maxDatePrecision})` : ''}`;
  }

  const length = values.reduce((max, value) => Math.max(max, countCodePoints(value)), 1);

  return length <= 255 ? `varchar(${length})` : 'text';
}

function countCodePoints(value: string): number {
  let count = 0;

  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i += 1;
    }
    count += 1;
  }

  return count;
}
