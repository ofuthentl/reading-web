import type { Book } from '@/types';
import { fetchBookBlobCached } from '@/lib/api';

function resolveZipPath(baseDir: string, relativeHref: string): string {
  const cleanHref = relativeHref.replace(/^\//, '');
  if (!baseDir) return cleanHref;
  const stack = baseDir.split('/').filter(Boolean);
  for (const part of cleanHref.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function cleanExtractedText(raw: string, maxLength = 900): string | null {
  const normalized = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (normalized.length < 16) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

function htmlStringToCleanText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, nav, svg').forEach((el) => el.remove());
  const blocks = Array.from(doc.querySelectorAll('p, div, li'));
  if (blocks.length > 0) {
    const lines = blocks
      .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 0);
    if (lines.length > 0) return lines.join('\n');
  }
  return (doc.body?.textContent || '').trim();
}

/**
 * Tự trích xuất tóm tắt / giới thiệu tác phẩm từ siêu dữ liệu `<dc:description>` trong OPF
 * hoặc mục "Giới thiệu tác phẩm / Tóm tắt" ở đầu tệp `.epub` (chỉ nạp khi Admin bấm nút).
 */
export async function extractBookAutoDescription(book: Book): Promise<string | null> {
  if (book.file_type !== 'epub') return null;

  const { blob } = await fetchBookBlobCached(book);
  const JSZipMod = await import('jszip');
  const JSZip = JSZipMod.default || JSZipMod;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) return null;
  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootFile = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootFile) return null;

  const packageXml = await zip.file(rootFile)?.async('string');
  if (!packageXml) return null;
  const pkgDoc = new DOMParser().parseFromString(packageXml, 'application/xml');
  const pkgDir = rootFile.includes('/') ? rootFile.slice(0, rootFile.lastIndexOf('/')) : '';

  // 1. Ưu tiên đọc thẻ <dc:description> hoặc <description> trong content.opf
  const descNodes = [
    ...Array.from(pkgDoc.getElementsByTagName('dc:description')),
    ...Array.from(pkgDoc.getElementsByTagName('description')),
  ];
  for (const node of descNodes) {
    const raw = node.textContent?.trim();
    if (!raw) continue;
    const text = /<[a-z][\s\S]*>/i.test(raw) ? htmlStringToCleanText(raw) : raw;
    const cleaned = cleanExtractedText(text);
    if (cleaned) return cleaned;
  }

  // 2. Fallback: quét tối đa 6 mục đầu trong spine để tìm trang "Giới thiệu / Tóm tắt / Synopsis"
  const manifest = new Map<string, string>();
  pkgDoc.querySelectorAll('manifest item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, href);
  });

  const spineIds = Array.from(pkgDoc.querySelectorAll('spine itemref'))
    .map((ref) => ref.getAttribute('idref') || '')
    .filter(Boolean)
    .slice(0, 6);

  for (const idref of spineIds) {
    const href = manifest.get(idref);
    if (!href) continue;
    const path = resolveZipPath(pkgDir, decodeURIComponent(href.split('#')[0]));
    const html = await zip.file(path)?.async('string');
    if (!html) continue;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headingText = Array.from(doc.querySelectorAll('title, h1, h2, h3'))
      .map((el) => (el.textContent || '').trim())
      .join(' ');

    if (/giới\s*thiệu|tóm\s*tắt|nội\s*dung\s*sách|synopsis|summary/i.test(headingText)) {
      doc.querySelectorAll('h1, h2, h3').forEach((el) => el.remove());
      const paras = Array.from(doc.querySelectorAll('p'))
        .map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((line) => line.length >= 12);
      const cleaned = cleanExtractedText(paras.join('\n'));
      if (cleaned) return cleaned;
    }
  }

  return null;
}
