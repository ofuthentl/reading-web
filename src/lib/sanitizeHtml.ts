import DOMPurify from 'dompurify';

const FORBIDDEN_BOOK_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'base',
  'meta',
  'form',
  'frame',
  'frameset',
  'video',
  'audio',
  'source',
  'track',
  'animate',
  'set',
  'animateMotion',
  'animateTransform',
];

const FORBIDDEN_BOOK_ATTRS = ['style', 'srcset', 'poster'];

const BOOK_SANITIZE_CONFIG = {
  FORBID_TAGS: FORBIDDEN_BOOK_TAGS,
  FORBID_ATTR: FORBIDDEN_BOOK_ATTRS,
  ADD_TAGS: ['ruby', 'rt', 'rp', 'rb'],
  ADD_ATTR: ['epub:type', 'role'],
};

const HTML_VOID_OR_SVG_LEAF_RE =
  /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr|image|path|rect|circle|line|polygon|polyline|ellipse|use|stop)$/i;
const SELF_CLOSING_TAG_RE = /<([a-zA-Z][\w:-]*)(?:\s[^<>]*?)?\/>/g;
const EMPTY_HEAD_RAWTEXT_RE = /<(title|style|script|textarea)(\s[^<>]*?)?\/>/gi;

function hasNonVoidSelfClosingTag(source: string): boolean {
  SELF_CLOSING_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SELF_CLOSING_TAG_RE.exec(source)) !== null) {
    if (!HTML_VOID_OR_SVG_LEAF_RE.test(match[1])) return true;
  }
  return false;
}

/**
 * Parses and sanitizes raw EPUB/DOCX HTML in a single DOMPurify pass (`RETURN_DOM: true`),
 * avoiding redundant innerHTML serialize/re-parse round-trips on the main thread.
 * Must run BEFORE replacing image sources with blob: URLs because DOMPurify strips blob: URIs.
 */
export function sanitizeHtmlToBody(rawHtml: string): HTMLElement {
  const result = DOMPurify.sanitize(rawHtml, {
    ...BOOK_SANITIZE_CONFIG,
    RETURN_DOM: true,
  }) as HTMLElement | null;
  return result ?? document.createElement('body');
}

/**
 * Parse và làm sạch XHTML của 1 chương EPUB trong 1 bước (`sanitizeHtmlToBody`):
 * - Chuẩn hoá nhanh `<title/>`, `<style/>`, `<script/>`, `<textarea/>` rồi kiểm tra xem có thẻ tự đóng non-void (`<a id="fn1"/>`, `<b/>`, `<div/>`...) hay không.
 * - Khi có thẻ tự đóng non-void: import `xmlDoc.body` sang tài liệu HTML (`createHTMLDocument`) để trình tuần tự hoá HTML5 mở rộng ĐẦY ĐỦ mọi thẻ non-void trước khi đưa vào `DOMPurify`.
 */
export function parseAndSanitizeEpubBody(source: string): HTMLElement {
  const preNormalized = source.includes('/>')
    ? source.replace(EMPTY_HEAD_RAWTEXT_RE, '<$1$2></$1>')
    : source;

  if (!preNormalized.includes('/>') || !hasNonVoidSelfClosingTag(preNormalized)) {
    return sanitizeHtmlToBody(preNormalized);
  }

  try {
    const xmlDoc = new DOMParser().parseFromString(source, 'application/xhtml+xml');
    if (!xmlDoc.querySelector('parsererror') && xmlDoc.body) {
      const htmlDoc = document.implementation.createHTMLDocument('');
      const importedBody = htmlDoc.importNode(xmlDoc.body, true);
      return sanitizeHtmlToBody(importedBody.innerHTML);
    }
  } catch {
    // Fallback to universal non-void tag expansion + HTML5 sanitizer below
  }

  const fallbackNormalized = preNormalized.replace(
    /<([a-zA-Z][\w:-]*)(\s[^<>]*?)?\/>/g,
    (full, tagName: string, attrs = '') =>
      HTML_VOID_OR_SVG_LEAF_RE.test(tagName) ? full : `<${tagName}${attrs}></${tagName}>`,
  );
  return sanitizeHtmlToBody(fallbackNormalized);
}

/**
 * Sanitizes standalone `.svg` files before turning them into same-origin `blob:` URLs,
 * preventing `<script>` / `on*` / `foreignObject` execution if opened in a new tab.
 */
export async function sanitizeSvgBlob(rawBlob: Blob): Promise<Blob> {
  const rawSvg = await rawBlob.text();
  const cleanSvg = DOMPurify.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      'script',
      'foreignObject',
      'iframe',
      'object',
      'embed',
      'animate',
      'set',
      'animateMotion',
      'animateTransform',
    ],
  });
  return new Blob([cleanSvg], { type: 'image/svg+xml' });
}
