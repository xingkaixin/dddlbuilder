import i18n from '@/i18n';
import { EXCEL_ARCHIVE_LIMITS } from '@/utils/importLimits';
import { Inflate } from 'fflate';

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_EXTRA_FIELD = 0x0001;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const END_RECORD_BYTES = 22;
const SUPPORTED_GENERAL_PURPOSE_FLAGS = 0x0006 | 0x0800;
const INFLATE_INPUT_CHUNK_BYTES = 4 * 1024;

type ArchiveEntry = {
  compressionMethod: 0 | 8;
  localHeaderOffset: number;
  compressedOffset: number;
  compressedSize: number;
  uncompressedSize: number;
};

function rejectArchive(): never {
  throw new Error(i18n.t('importSql.excelArchiveRejected'));
}

function findEndRecord(view: DataView): number {
  const firstOffset = view.byteLength - END_RECORD_BYTES;
  const lastOffset = Math.max(0, firstOffset - MAX_ZIP_COMMENT_BYTES);

  for (let offset = firstOffset; offset >= lastOffset; offset -= 1) {
    if (view.getUint32(offset, true) !== END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + END_RECORD_BYTES + commentLength === view.byteLength) return offset;
  }

  return rejectArchive();
}

function assertPlainExtraFields(view: DataView, offset: number, length: number): void {
  const end = offset + length;
  let cursor = offset;

  while (cursor < end) {
    if (cursor + 4 > end) rejectArchive();
    const fieldId = view.getUint16(cursor, true);
    const fieldLength = view.getUint16(cursor + 2, true);
    cursor += 4;
    if (cursor + fieldLength > end || fieldId === ZIP64_EXTRA_FIELD) rejectArchive();
    cursor += fieldLength;
  }
}

function assertLocalFileHeader(
  view: DataView,
  offset: number,
  centralFlags: number,
  compressionMethod: number,
  compressedSize: number,
  uncompressedSize: number,
  centralDirectoryOffset: number,
): number {
  if (offset + 30 > centralDirectoryOffset || view.getUint32(offset, true) !== LOCAL_FILE_HEADER) {
    rejectArchive();
  }

  const flags = view.getUint16(offset + 6, true);
  const localCompressionMethod = view.getUint16(offset + 8, true);
  const localCompressedSize = view.getUint32(offset + 18, true);
  const localUncompressedSize = view.getUint32(offset + 22, true);
  if (
    flags !== centralFlags ||
    localCompressionMethod !== compressionMethod ||
    localCompressedSize !== compressedSize ||
    localUncompressedSize !== uncompressedSize
  ) {
    rejectArchive();
  }

  const fileNameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const extraOffset = offset + 30 + fileNameLength;
  const dataOffset = extraOffset + extraLength;
  if (dataOffset + compressedSize > centralDirectoryOffset) rejectArchive();
  assertPlainExtraFields(view, extraOffset, extraLength);
  return dataOffset;
}

function assertActualUncompressedSize(
  bytes: Uint8Array,
  entry: ArchiveEntry,
  totalUncompressedBytes: number,
): number {
  if (entry.compressionMethod === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) rejectArchive();
    return entry.uncompressedSize;
  }

  let entryBytes = 0;
  const inflate = new Inflate((chunk) => {
    if (
      chunk.byteLength > EXCEL_ARCHIVE_LIMITS.maxEntryBytes - entryBytes ||
      chunk.byteLength >
        EXCEL_ARCHIVE_LIMITS.maxUncompressedBytes - totalUncompressedBytes - entryBytes
    ) {
      rejectArchive();
    }
    entryBytes += chunk.byteLength;
  });
  const endOffset = entry.compressedOffset + entry.compressedSize;

  try {
    if (entry.compressedSize === 0) {
      inflate.push(new Uint8Array(), true);
    } else {
      for (
        let offset = entry.compressedOffset;
        offset < endOffset;
        offset += INFLATE_INPUT_CHUNK_BYTES
      ) {
        const nextOffset = Math.min(offset + INFLATE_INPUT_CHUNK_BYTES, endOffset);
        inflate.push(bytes.subarray(offset, nextOffset), nextOffset === endOffset);
      }
    }
  } catch {
    return rejectArchive();
  }

  if (entryBytes !== entry.uncompressedSize) rejectArchive();
  return entryBytes;
}

export function assertSafeExcelArchive(data: ArrayBuffer): void {
  const view = new DataView(data);
  if (view.byteLength < 4 || view.getUint16(0, true) !== 0x4b50) return;
  if (view.getUint32(0, true) !== LOCAL_FILE_HEADER) rejectArchive();

  const endOffset = findEndRecord(view);
  const diskNumber = view.getUint16(endOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(endOffset + 6, true);
  const diskEntries = view.getUint16(endOffset + 8, true);
  const totalEntries = view.getUint16(endOffset + 10, true);
  const centralDirectorySize = view.getUint32(endOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    totalEntries > EXCEL_ARCHIVE_LIMITS.maxEntries ||
    centralDirectoryOffset + centralDirectorySize !== endOffset
  ) {
    rejectArchive();
  }

  let cursor = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  const entries: ArchiveEntry[] = [];
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > endOffset || view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_HEADER) {
      rejectArchive();
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const extraOffset = cursor + 46 + fileNameLength;
    const nextEntry = extraOffset + extraLength + commentLength;

    if (
      (flags & ~SUPPORTED_GENERAL_PURPOSE_FLAGS) !== 0 ||
      (compressionMethod !== 0 && compressionMethod !== 8) ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      diskStart === 0xffff ||
      diskStart !== 0 ||
      localHeaderOffset === 0xffffffff ||
      nextEntry > endOffset ||
      uncompressedSize > EXCEL_ARCHIVE_LIMITS.maxEntryBytes
    ) {
      rejectArchive();
    }

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > EXCEL_ARCHIVE_LIMITS.maxUncompressedBytes) rejectArchive();

    assertPlainExtraFields(view, extraOffset, extraLength);
    const compressedOffset = assertLocalFileHeader(
      view,
      localHeaderOffset,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      centralDirectoryOffset,
    );
    entries.push({
      compressionMethod,
      localHeaderOffset,
      compressedOffset,
      compressedSize,
      uncompressedSize,
    });
    cursor = nextEntry;
  }

  if (cursor !== endOffset) rejectArchive();

  entries.sort((left, right) => left.localHeaderOffset - right.localHeaderOffset);
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (current.localHeaderOffset < previous.compressedOffset + previous.compressedSize) {
      rejectArchive();
    }
  }

  const bytes = new Uint8Array(data);
  totalUncompressedBytes = 0;
  for (const entry of entries) {
    totalUncompressedBytes += assertActualUncompressedSize(bytes, entry, totalUncompressedBytes);
  }
}
