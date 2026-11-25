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

/**
 * Parses and sanitizes raw EPUB/DOCX HTML in a single DOMPurify pass (`RETURN_DOM: true`),
 * avoiding redundant innerHTML serialize/re-parse round-trips on the main thread.
 * Must run BEFORE replacing image sources with blob: URLs because DOMPurify strips blob: URIs.
 */
export function sanitizeHtmlToBody(rawHtml: string): HTMLElement {
  return DOMPurify.sanitize(rawHtml, {
    ...BOOK_SANITIZE_CONFIG,
    RETURN_DOM: true,
  }) as HTMLElement;
}

/**
 * Sanitizes parsed EPUB/DOCX HTML before rendering via dangerouslySetInnerHTML.
 * Must run BEFORE replacing image sources with blob: URLs because DOMPurify
 * strips blob: URIs by default. Preserves `epub:type` & `role` for EPUB3 footnotes.
 */
export function sanitizeBookDocument(doc: Document): void {
  if (!doc.body) return;
  doc.body.innerHTML = DOMPurify.sanitize(doc.body.innerHTML, BOOK_SANITIZE_CONFIG);
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
