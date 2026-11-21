export interface ZipSliceInfo {
  dataOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  compression: 0 | 8;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_HEADER_SIG = 0x02014b50;
const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const MAX_EOCD_COMMENT = 0xffff;

function normalizeZipPath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Đọc trực tiếp bảng Central Directory & Local File Header của tệp PKZIP (.epub / .docx)
 * trong < 1 ms để trích xuất toạ độ byte-range [dataOffset, compressedSize] của từng tệp con
 * mà không cần nhân bản dữ liệu ảnh trên Cloudflare R2 (D-028).
 */
export function parseZipEntryOffsets(buffer: ArrayBuffer): Map<string, ZipSliceInfo> {
  const result = new Map<string, ZipSliceInfo>();
  const byteLen = buffer.byteLength;
  if (byteLen < 22) return result;

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');

  const minSearchOffset = Math.max(0, byteLen - 22 - MAX_EOCD_COMMENT);
  let eocdOffset = -1;
  for (let pos = byteLen - 22; pos >= minSearchOffset; pos -= 1) {
    if (view.getUint32(pos, true) === EOCD_SIGNATURE) {
      const commentLen = view.getUint16(pos + 20, true);
      if (pos + 22 + commentLen <= byteLen) {
        eocdOffset = pos;
        break;
      }
    }
  }
  if (eocdOffset < 0) return result;

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  if (cdOffset === 0xffffffff || cdOffset + cdSize > byteLen) {
    return result;
  }

  let ptr = cdOffset;
  const cdEnd = cdOffset + cdSize;
  for (let i = 0; i < totalEntries && ptr + 46 <= cdEnd; i += 1) {
    if (view.getUint32(ptr, true) !== CENTRAL_FILE_HEADER_SIG) break;

    const compression = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const uncompressedSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const nextPtr = ptr + 46 + nameLen + extraLen + commentLen;
    if (ptr + 46 + nameLen > byteLen) break;

    const rawName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr = nextPtr;

    if (
      rawName.endsWith('/') ||
      (compression !== 0 && compression !== 8) ||
      compressedSize === 0 ||
      compressedSize === 0xffffffff ||
      localHeaderOffset + 30 > byteLen
    ) {
      continue;
    }

    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIG) {
      continue;
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
    if (dataOffset < 0 || dataOffset + compressedSize > byteLen) {
      continue;
    }

    result.set(normalizeZipPath(rawName), {
      dataOffset,
      compressedSize,
      uncompressedSize,
      compression,
    });
  }

  return result;
}
