import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const MAX_ENTRY_GZIP_KB = 86.04; // Ngưỡng ngân sách bất biến theo D-013 (đơn vị kB thập phân giống Vite)
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const assetsDir = resolve(rootDir, 'dist', 'assets');

const files = readdirSync(assetsDir);
const entryJsFiles = files.filter((f) => /^index-[^.]+\.js$/.test(f));
if (entryJsFiles.length !== 1) {
  console.error(
    `Kỳ vọng đúng 1 entry chunk dist/assets/index-*.js, tìm thấy ${entryJsFiles.length}: ${entryJsFiles.join(', ')}`,
  );
  process.exit(1);
}

const entryJsName = entryJsFiles[0];
const entryJsRaw = readFileSync(join(assetsDir, entryJsName));
const entryGzipBytes = gzipSync(entryJsRaw, { level: 9 }).byteLength;
const entryGzipKb = entryGzipBytes / 1000;

console.log(
  `Entry bundle: dist/assets/${entryJsName} = ${(entryJsRaw.byteLength / 1000).toFixed(2)} kB | gzip: ${entryGzipKb.toFixed(2)} kB (giới hạn D-013: <= ${MAX_ENTRY_GZIP_KB.toFixed(2)} kB)`,
);

if (entryGzipKb > MAX_ENTRY_GZIP_KB) {
  console.error(
    `LỖI NGÂN SÁCH BUNDLE (D-013): ${entryGzipKb.toFixed(2)} kB gzip vượt trần ${MAX_ENTRY_GZIP_KB.toFixed(2)} kB!`,
  );
  process.exit(1);
}

const entryCssFiles = files.filter((f) => /^index-[^.]+\.css$/.test(f));
for (const cssFile of entryCssFiles) {
  const cssContent = readFileSync(join(assetsDir, cssFile), 'utf8');
  if (cssContent.includes('data:image/')) {
    console.error(
      `LỖI CSS ENTRY: dist/assets/${cssFile} vẫn chứa ảnh base64 inline (data:image/)!`,
    );
    process.exit(1);
  }
}

console.log('Cổng ngân sách bundle & CSS entry đạt chuẩn (D-013 / D-046).');
