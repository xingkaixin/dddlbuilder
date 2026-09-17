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

  const dates = values.map((value) => normalizeImportDate(value, options.dateFormat));

  if (dates.every((value) => value !== null)) {
    if (dates.every((value) => value?.length === 10)) return 'date';

    const precision = dates.reduce(
      (max, value) => Math.max(max, value?.split('.')[1]?.length ?? 0),
      0,
    );

    return `${dialect === 'mysql' ? 'datetime' : 'timestamp'}${precision ? `(${precision})` : ''}`;
  }

  const length = values.reduce((max, value) => Math.max(max, Array.from(value).length), 1);

  return length <= 255 ? `varchar(${length})` : 'text';
}
