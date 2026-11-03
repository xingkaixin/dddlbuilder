import { assertSafeExcelArchive } from '@/utils/excelArchiveGuard';
import { EXCEL_ARCHIVE_LIMITS } from '@/utils/importLimits';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

async function createWorkbookArchive(): Promise<ArrayBuffer> {
  const xlsx = await import('xlsx');
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.aoa_to_sheet([
      ['fieldName', 'fieldType'],
      ['id', 'bigint'],
    ]),
    'users',
  );

  return xlsx.write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
}

function findEndRecord(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) return offset;
  }

  throw new Error('missing test ZIP end record');
}

function listCentralEntries(view: DataView, endOffset: number): number[] {
  const count = view.getUint16(endOffset + 10, true);
  const entries: number[] = [];
  let offset = view.getUint32(endOffset + 16, true);

  for (let index = 0; index < count; index += 1) {
    entries.push(offset);
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }

  return entries;
}

describe('excelArchiveGuard', () => {
  it('rejects oversized entries and total extracted size', async () => {
    const oversizedEntry = (await createWorkbookArchive()).slice(0);
    const entryView = new DataView(oversizedEntry);
    const entryEnd = findEndRecord(entryView);
    const [entry] = listCentralEntries(entryView, entryEnd);
    entryView.setUint32(entry + 24, EXCEL_ARCHIVE_LIMITS.maxEntryBytes + 1, true);
    expect(() => assertSafeExcelArchive(oversizedEntry)).toThrow('解压后过大或压缩包结构不受支持');

    const oversizedTotal = (await createWorkbookArchive()).slice(0);
    const totalView = new DataView(oversizedTotal);
    const totalEnd = findEndRecord(totalView);
    const entries = listCentralEntries(totalView, totalEnd);

    for (const centralEntry of entries.slice(0, 5)) {
      const localEntry = totalView.getUint32(centralEntry + 42, true);
      totalView.setUint32(centralEntry + 24, EXCEL_ARCHIVE_LIMITS.maxEntryBytes, true);
      totalView.setUint32(localEntry + 22, EXCEL_ARCHIVE_LIMITS.maxEntryBytes, true);
    }

    expect(() => assertSafeExcelArchive(oversizedTotal)).toThrow('解压后过大或压缩包结构不受支持');
  });

  it('rejects actual DEFLATE output above the limit when both declared sizes are forged', () => {
    const archive = zipSync({
      'oversized.txt': strToU8('x'.repeat(EXCEL_ARCHIVE_LIMITS.maxEntryBytes + 1)),
    }).buffer;
    const view = new DataView(archive);
    const endOffset = findEndRecord(view);
    const [centralEntry] = listCentralEntries(view, endOffset);
    const localEntry = view.getUint32(centralEntry + 42, true);
    view.setUint32(centralEntry + 24, 1, true);
    view.setUint32(localEntry + 22, 1, true);

    expect(() => assertSafeExcelArchive(archive)).toThrow('解压后过大或压缩包结构不受支持');
  });
});
