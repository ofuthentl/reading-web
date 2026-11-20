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
  'animate',
  'set',
  'animateMotion',
  'animateTransform',
];

/**
 * Sanitizes parsed EPUB/DOCX HTML before rendering via dangerouslySetInnerHTML.
 * Must run BEFORE replacing image sources with blob: URLs because DOMPurify
 * strips blob: URIs by default. Avoids IN_PLACE because root is <body>.
 */
export function sanitizeBookDocument(doc: Document): void {
  if (!doc.body) return;
  doc.body.innerHTML = DOMPurify.sanitize(doc.body.innerHTML, {
    FORBID_TAGS: FORBIDDEN_BOOK_TAGS,
  });
}
