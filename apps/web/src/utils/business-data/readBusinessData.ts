import { BUSINESS_DATA_LIMITS, type BusinessData } from '@ddlbuilder/ddl-core';
import type { CellObject } from 'xlsx';
import { assertSafeExcelArchive } from '@/utils/excelArchiveGuard';

export const BUSINESS_TEXT_BYTES = 2 * 1024 * 1024;
export const BUSINESS_EXCEL_BYTES = 5 * 1024 * 1024;

export type BusinessSeparator = ',' | '\t' | ';';

export interface BusinessDataSource {
  data: BusinessData | null;
  sheets: string[];
  sheet: string;
}

function finishRows(records: BusinessData['rows']): BusinessData {
  const [header, ...rows] = records;

  if (!header || records.every((record) => record.values.every((value) => value === '')))
    throw new Error('dataImport.errors.empty');
  const headers = header?.values.map((value) => value.trim()) ?? [];

  if (!headers.length || headers.some((name) => !name) || new Set(headers).size !== headers.length)
    throw new Error('dataImport.errors.headers');

  if (!rows.length) throw new Error('dataImport.errors.empty');

  if (
    headers.length > BUSINESS_DATA_LIMITS.columns ||
    rows.length > BUSINESS_DATA_LIMITS.rows ||
    rows.length * headers.length > BUSINESS_DATA_LIMITS.cells
  )
    throw new Error('dataImport.errors.limits');

  if (rows.some((row) => row.values.length !== headers.length))
    throw new Error('dataImport.errors.width');
  let characters = 0;

  for (const record of records) {
    for (const value of record.values) {
      characters += value.length;

      if (value.length > BUSINESS_DATA_LIMITS.cellCharacters || characters > BUSINESS_TEXT_BYTES)
        throw new Error('dataImport.errors.limits');
    }
  }

  return { headers, rows };
}

export function readBusinessText(text: string, separator: BusinessSeparator): BusinessData {
  if (new TextEncoder().encode(text).length > BUSINESS_TEXT_BYTES)
    throw new Error('dataImport.errors.limits');
  const input = text.replace(/^\uFEFF/, '');
  const records: BusinessData['rows'] = [];
  let values: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  let line = 1;
  let startLine = 1;

  const finishCell = () => {
    values.push(cell);
    cell = '';
    closed = false;

    if (values.length > BUSINESS_DATA_LIMITS.columns) throw new Error('dataImport.errors.limits');
  };
  const finishRow = () => {
    finishCell();

    if (values.some((value) => value !== '')) records.push({ line: startLine, values });
    values = [];

    if (records.length > BUSINESS_DATA_LIMITS.rows + 1) throw new Error('dataImport.errors.limits');
  };

  for (let index = 0; index < input.length; index++) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += character;

        if (character === '\n' || (character === '\r' && input[index + 1] !== '\n')) line++;
      }
    } else if (character === separator) finishCell();
    else if (character === '\r' || character === '\n') {
      finishRow();

      if (character === '\r' && input[index + 1] === '\n') index++;
      line++;
      startLine = line;
    } else if (character === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || character === '"') throw new Error('dataImport.errors.csv');
      cell += character;
    }

    if (cell.length > BUSINESS_DATA_LIMITS.cellCharacters)
      throw new Error('dataImport.errors.limits');
  }

  if (quoted) throw new Error('dataImport.errors.csv');

  if (cell || closed || values.length) finishRow();

  return finishRows(records);
}

export async function readBusinessExcel(
  bytes: ArrayBuffer,
  selectedSheet = '',
): Promise<BusinessDataSource> {
  if (bytes.byteLength > BUSINESS_EXCEL_BYTES) throw new Error('dataImport.errors.limits');

  if (bytes.byteLength < 4 || new DataView(bytes).getUint32(0, true) !== 0x04034b50)
    throw new Error('dataImport.errors.xlsx');
  assertSafeExcelArchive(bytes);
  const xlsx = await import('xlsx');
  const metadata = xlsx.read(bytes, { type: 'array', bookSheets: true });
  const sheets = metadata.SheetNames;

  if (!sheets.length || sheets.length > 50) throw new Error('dataImport.errors.limits');

  if (!selectedSheet) return { data: null, sheets, sheet: '' };
  const sheetName = selectedSheet;
  const sheetIndex = sheets.indexOf(sheetName);

  if (sheetIndex < 0) throw new Error('dataImport.errors.sheet');

  const workbook = xlsx.read(bytes, {
    type: 'array',
    sheets: [sheetIndex],
    sheetRows: BUSINESS_DATA_LIMITS.rows + 2,
    cellNF: true,
    cellFormula: true,
    cellHTML: false,
    cellText: true,
    nodim: true,
  });
  const sheet = workbook.Sheets[sheetName];

  if (!sheet?.['!ref']) throw new Error('dataImport.errors.empty');

  if (sheet['!merges']?.length) throw new Error('dataImport.errors.merged');
  const range = xlsx.utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);

  if (
    range.s.r !== 0 ||
    range.s.c !== 0 ||
    range.e.r > BUSINESS_DATA_LIMITS.rows ||
    range.e.c >= BUSINESS_DATA_LIMITS.columns ||
    range.e.r * (range.e.c + 1) > BUSINESS_DATA_LIMITS.cells
  )
    throw new Error('dataImport.errors.limits');
  const rows: BusinessData['rows'] = [];

  for (let row = 0; row <= range.e.r; row++) {
    const values: string[] = [];

    for (let column = 0; column <= range.e.c; column++) {
      const address = xlsx.utils.encode_cell({ r: row, c: column });
      const cell: CellObject | undefined = sheet[address];

      if (cell?.f || cell?.F) throw new Error(`dataImport.errors.formula|${address}`);

      if (cell?.t === 'e') throw new Error(`dataImport.errors.cell|${address}`);

      if (cell?.t === 'n' && cell.z && xlsx.SSF.is_date(cell.z)) {
        const date = xlsx.SSF.parse_date_code(Number(cell.v), {
          date1904: workbook.Workbook?.WBProps?.date1904,
        });

        if (
          !date ||
          date.y < 1000 ||
          date.y > 9999 ||
          (date.y === 1900 && date.m === 2 && date.d === 29) ||
          date.u > 0.000001
        )
          throw new Error(`dataImport.errors.cell|${address}`);
        const day = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
        values.push(
          date.H || date.M || date.S
            ? `${day} ${String(date.H).padStart(2, '0')}:${String(date.M).padStart(2, '0')}:${String(date.S).padStart(2, '0')}`
            : day,
        );
      } else values.push(excelValue(cell, address));
    }

    if (row === 0 || values.some((value) => value !== '')) rows.push({ line: row + 1, values });
  }

  return { data: finishRows(rows), sheets, sheet: sheetName };
}

function excelValue(cell: CellObject | undefined, address: string): string {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  const value = cell.v;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- SheetJS cells contain externally typed values.
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
      throw new Error(`dataImport.errors.number|${address}`);

    if (cell.w && /^0\d+$/.test(cell.w)) return cell.w;
  }

  return String(value);
}
