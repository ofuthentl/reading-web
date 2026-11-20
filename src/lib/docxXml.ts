import type JSZip from 'jszip';

export interface DocxRel {
  target: string;
  external: boolean;
}

export interface StyleMeta {
  name: string;
  basedOn: string | null;
  outlineLevel: number | null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getAttr(el: Element, localName: string): string | null {
  for (let i = 0; i < el.attributes.length; i += 1) {
    const attr = el.attributes[i];
    if (attr.localName === localName) return attr.value;
  }
  return null;
}

export function findDirectChild(parent: Element, localName: string): Element | null {
  for (let i = 0; i < parent.children.length; i += 1) {
    const child = parent.children[i];
    if (child.localName === localName) return child;
  }
  return null;
}

export function resolveDocxPath(baseDir: string, target: string): string {
  const cleaned = target.replace(/\\/g, '/').split('#')[0].split('?')[0];
  if (cleaned.startsWith('/')) return cleaned.replace(/^\/+/, '');
  const parts = `${baseDir}/${cleaned}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

export function guessImageMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'avif':
      return 'image/avif';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg';
  }
}

export async function parseRelationships(zip: JSZip, path: string): Promise<Map<string, DocxRel>> {
  const rels = new Map<string, DocxRel>();
  const xml = await zip.file(path)?.async('string');
  if (!xml) return rels;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el.localName !== 'Relationship') continue;
    const id = getAttr(el, 'Id');
    const target = getAttr(el, 'Target');
    if (!id || !target) continue;
    const targetMode = getAttr(el, 'TargetMode');
    rels.set(id, { target, external: targetMode?.toLowerCase() === 'external' });
  }
  return rels;
}

export async function parseStyles(zip: JSZip): Promise<Map<string, StyleMeta>> {
  const styles = new Map<string, StyleMeta>();
  const xml = await zip.file('word/styles.xml')?.async('string');
  if (!xml) return styles;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el.localName !== 'style') continue;
    const styleId = getAttr(el, 'styleId');
    if (!styleId) continue;
    const nameEl = findDirectChild(el, 'name');
    const basedOnEl = findDirectChild(el, 'basedOn');
    const pPr = findDirectChild(el, 'pPr');
    const outlineEl = pPr ? findDirectChild(pPr, 'outlineLvl') : null;
    const rawOutline = outlineEl ? Number(getAttr(outlineEl, 'val')) : NaN;
    styles.set(styleId, {
      name: (nameEl ? getAttr(nameEl, 'val') : '') || styleId,
      basedOn: basedOnEl ? getAttr(basedOnEl, 'val') : null,
      outlineLevel: Number.isInteger(rawOutline) && rawOutline >= 0 ? rawOutline : null,
    });
  }
  return styles;
}

export async function parseNumberingKinds(zip: JSZip): Promise<Map<string, 'ul' | 'ol'>> {
  const kinds = new Map<string, 'ul' | 'ol'>();
  const xml = await zip.file('word/numbering.xml')?.async('string');
  if (!xml) return kinds;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const abstractKinds = new Map<string, 'ul' | 'ol'>();

  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el.localName !== 'abstractNum') continue;
    const abstractId = getAttr(el, 'abstractNumId');
    if (!abstractId) continue;
    let kind: 'ul' | 'ol' = 'ol';
    for (const child of Array.from(el.children)) {
      if (child.localName !== 'lvl') continue;
      const fmtEl = findDirectChild(child, 'numFmt');
      const fmt = fmtEl ? getAttr(fmtEl, 'val')?.toLowerCase() : '';
      if (fmt === 'bullet' || fmt === 'none') kind = 'ul';
      break;
    }
    abstractKinds.set(abstractId, kind);
  }

  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el.localName !== 'num') continue;
    const numId = getAttr(el, 'numId');
    const refEl = findDirectChild(el, 'abstractNumId');
    const abstractId = refEl ? getAttr(refEl, 'val') : null;
    if (numId && abstractId) {
      kinds.set(numId, abstractKinds.get(abstractId) ?? 'ul');
    }
  }
  return kinds;
}

export function resolveHeadingFromStyle(
  styleId: string | null,
  styles: Map<string, StyleMeta>,
): { headingLevel: number | null; isTitle: boolean } {
  if (!styleId) return { headingLevel: null, isTitle: false };
  const visited = new Set<string>();
  let currentId: string | null = styleId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const meta = styles.get(currentId);
    const candidate = `${meta?.name || ''} ${currentId}`.trim();
    if (/^(?:title|tiêu\s*đề)\b/i.test(meta?.name || currentId)) {
      return { headingLevel: null, isTitle: true };
    }
    const headingMatch =
      candidate.match(/\bheading\s*([1-6])\b/i) || currentId.match(/^Heading([1-6])$/i);
    if (headingMatch) {
      return { headingLevel: Number(headingMatch[1]), isTitle: false };
    }
    if (meta && meta.outlineLevel !== null && meta.outlineLevel <= 5) {
      return { headingLevel: meta.outlineLevel + 1, isTitle: false };
    }
    currentId = meta?.basedOn ?? null;
  }
  return { headingLevel: null, isTitle: false };
}

export function isToggleFlagEnabled(rPr: Element, tagName: string): boolean {
  const el = findDirectChild(rPr, tagName);
  if (!el) return false;
  const val = getAttr(el, 'val')?.toLowerCase();
  return val !== '0' && val !== 'false' && val !== 'none';
}

export function findImageRelIds(node: Element): string[] {
  const ids: string[] = [];
  const walk = (el: Element) => {
    if (el.localName === 'AlternateContent') {
      const choice = findDirectChild(el, 'Choice') || findDirectChild(el, 'Fallback');
      if (choice) walk(choice);
      return;
    }
    if (el.localName === 'blip') {
      const embed = getAttr(el, 'embed') || getAttr(el, 'link');
      if (embed) ids.push(embed);
    } else if (el.localName === 'imagedata') {
      const id = getAttr(el, 'id');
      if (id) ids.push(id);
    }
    for (let i = 0; i < el.children.length; i += 1) {
      walk(el.children[i]);
    }
  };
  walk(node);
  return ids;
}
