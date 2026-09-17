import { beforeEach, describe, expect, it, vi } from 'vitest';
import { utils, write } from 'xlsx';
import { DEFAULT_DATA_IMPORT_OPTIONS, newDataImportTarget } from '@ddlbuilder/ddl-core';
import { readBusinessExcel, readBusinessText } from '@/utils/business-data/readBusinessData';
import {
  applyDataImportProfile,
  decodeDataImportProfile,
  deleteDataImportProfile,
  readDataImportProfiles,
  saveDataImportProfile,
  type DataImportProfile,
} from '@/utils/business-data/profiles';
import { executeBusinessDataTask } from '@/utils/business-data/tasks';

const profile: DataImportProfile = {
  version: 1,
  name: 'Orders',
  mode: 'new',
  dbType: 'postgresql',
  tableName: 'orders',
  schemaName: '',
  separator: ',',
  options: DEFAULT_DATA_IMPORT_OPTIONS,
  columns: [{ source: 'code', name: 'code', type: 'varchar(10)', nullable: false }],
};

beforeEach(() => {
  const values = new Map<string, string>();
  vi.mocked(localStorage.getItem).mockImplementation((key) => values.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
    values.set(key, value);
  });
});

function workbookBytes() {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([]), 'Empty');

  const sheet = utils.aoa_to_sheet([
    ['code', 'when', 'active'],
    ['00123', 45292, true],
  ]);
  sheet.B2.z = 'yyyy-mm-dd';
  utils.book_append_sheet(book, sheet, 'Orders');

  return {
    book,
    sheet,
    bytes: (): ArrayBuffer => write(book, { type: 'array', bookType: 'xlsx', compression: true }),
  };
}

describe('business files', () => {
  it('preserves CSV quoting, blank values, BOM and physical source rows', () => {
    const source = readBusinessText(
      '\uFEFFcode,note\r\n00123,"A, B\r\n""quoted"""\r\n\r\n00124,\r\n',
      ',',
    );
    expect(source).toEqual({
      headers: ['code', 'note'],
      rows: [
        { line: 2, values: ['00123', 'A, B\r\n"quoted"'] },
        { line: 5, values: ['00124', ''] },
      ],
    });
    expect(readBusinessText('code\tamount\n001\t19.90', '\t').rows[0].values).toEqual([
      '001',
      '19.90',
    ]);
    expect(readBusinessText('code;amount\n001;19.90', ';').rows[0].values).toEqual([
      '001',
      '19.90',
    ]);
  });

  it.each([
    ['a,a\n1,2', 'headers'],
    ['a,\n1,2', 'headers'],
    ['a,b\n1', 'width'],
    ['a\n"unclosed', 'csv'],
    ['a\n"closed"junk', 'csv'],
    ['a\nno"quote', 'csv'],
    ['a\n', 'empty'],
  ])('rejects malformed business data without a partial result: %s', (text, code) => {
    expect(() => readBusinessText(text, ',')).toThrow(`dataImport.errors.${code}`);
  });

  it('rejects limits instead of silently truncating rows, cells or input', () => {
    expect(() => readBusinessText(`a\n${'x'.repeat(10001)}`, ',')).toThrow('limits');
    expect(() =>
      readBusinessText(['a', ...Array.from({ length: 5001 }, () => '1')].join('\n'), ','),
    ).toThrow('limits');
    expect(() => readBusinessText('a'.repeat(2 * 1024 * 1024 + 1), ',')).toThrow('limits');
    const headers = Array.from({ length: 101 }, (_, index) => `c${index}`).join(',');
    expect(() => readBusinessText(`${headers}\n${headers}`, ',')).toThrow('limits');
  });

  it('lists worksheets even if the first is empty and preserves typed Excel values', async () => {
    const { bytes } = workbookBytes();
    expect(await readBusinessExcel(bytes())).toEqual({
      data: null,
      sheets: ['Empty', 'Orders'],
      sheet: '',
    });
    const result = await readBusinessExcel(bytes(), 'Orders');
    expect(result.data?.rows[0]).toEqual({ line: 2, values: ['00123', '2024-01-01', 'true'] });
    await expect(readBusinessExcel(bytes(), 'missing')).rejects.toThrow('sheet');
    await expect(readBusinessExcel(bytes(), 'Empty')).rejects.toThrow('empty');
  });

  it('rejects Excel formulas, merges, errors and unsafe numbers with their cell address', async () => {
    const { sheet, bytes } = workbookBytes();
    sheet.A2 = { t: 'n', v: 2, f: '1+1' };
    await expect(readBusinessExcel(bytes(), 'Orders')).rejects.toThrow('formula|A2');
    sheet.A2 = { t: 'n', v: 9007199254740992 };
    await expect(readBusinessExcel(bytes(), 'Orders')).rejects.toThrow('number|A2');
    sheet.A2 = { t: 'e', v: 7 };
    await expect(readBusinessExcel(bytes(), 'Orders')).rejects.toThrow('cell|A2');
    sheet.A2 = { t: 's', v: '00123' };
    sheet['!merges'] = [utils.decode_range('A2:B2')];
    await expect(readBusinessExcel(bytes(), 'Orders')).rejects.toThrow('merged');
    await expect(readBusinessExcel(new ArrayBuffer(3))).rejects.toThrow('xlsx');
  });

  it('reads valid UTF-8 files and rejects invalid encoding at the actual task boundary', async () => {
    const file = new File([], 'orders.csv');
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('code\n00123').buffer,
    });
    expect(
      await executeBusinessDataTask({ kind: 'file', file, separator: ',', sheet: '' }),
    ).toMatchObject({ source: { data: { headers: ['code'] } } });
    const invalid = new File([], 'invalid.csv');
    Object.defineProperty(invalid, 'arrayBuffer', {
      value: async () => new Uint8Array([0xff]).buffer,
    });
    await expect(
      executeBusinessDataTask({ kind: 'file', file: invalid, separator: ',', sheet: '' }),
    ).rejects.toThrow('encoding');
    await expect(
      executeBusinessDataTask({
        kind: 'file',
        file: new File([], 'old.xls'),
        separator: ',',
        sheet: '',
      }),
    ).rejects.toThrow('file');
  });
});

describe('import profiles', () => {
  it('saves and removes explicit profiles without overwriting a same-name profile', () => {
    saveDataImportProfile(profile);
    expect(readDataImportProfiles()).toEqual([profile]);
    expect(() => saveDataImportProfile({ ...profile, tableName: 'different' })).toThrow(
      'profileName',
    );
    expect(readDataImportProfiles()[0].tableName).toBe('orders');
    deleteDataImportProfile(profile.name);
    expect(readDataImportProfiles()).toEqual([]);
  });

  it('rejects corrupted, oversized and record-bearing files without changing saved settings', () => {
    saveDataImportProfile(profile);

    for (const value of [
      '{',
      JSON.stringify({ ...profile, version: 2 }),
      JSON.stringify({ ...profile, records: [['secret']] }),
      ' '.repeat(256 * 1024 + 1),
    ])
      expect(() => decodeDataImportProfile(value)).toThrow('profile');
    expect(readDataImportProfiles()).toEqual([profile]);
  });

  it('matches source columns by name and uses current existing-table field definitions', () => {
    const data = readBusinessText('extra,code\nignored,00123', ',');
    expect(applyDataImportProfile(profile, data, null)).toEqual(profile.columns);
    expect(() => applyDataImportProfile(profile, readBusinessText('other\nx', ','), null)).toThrow(
      'profileSource',
    );
    const existing = { ...profile, mode: 'existing' as const };

    const target = newDataImportTarget('postgresql', 'orders', '', [
      { ...profile.columns[0], type: 'varchar(3)', nullable: true },
    ]);
    expect(applyDataImportProfile(existing, data, target)).toEqual([
      { ...profile.columns[0], type: 'varchar(3)', nullable: true },
    ]);
    expect(() =>
      applyDataImportProfile(existing, data, { ...target, tableName: 'another' }),
    ).toThrow('profileTarget');
  });
});
