export interface WatermarkInlineSpan {
  t: string;
  b?: 1;
  i?: 1;
}

export type WatermarkBlock =
  | { kind: 'h'; level: 1 | 2 | 3; spans: WatermarkInlineSpan[] }
  | { kind: 'p'; spans: WatermarkInlineSpan[] }
  | { kind: 'quote'; spans: WatermarkInlineSpan[] }
  | { kind: 'list'; ordered?: 1; items: WatermarkInlineSpan[][] }
  | { kind: 'hr' }
  | { kind: 'img'; mediaIndex: number; alt?: string };

export interface ForensicCandidateInput {
  discordUserId: string;
  discordUsername: string;
}

export interface ForensicMatchResult {
  discordUserId: string;
  discordUsername: string;
  matchedSlots: number;
  totalSlots: number;
  matchPercent: number;
  toneMatchedSlots: number;
  toneTotalSlots: number;
  toneMatchPercent: number;
  scorePercent: number;
}

interface VariantPair {
  id: string;
  bit0: string;
  bit1: string;
  isTone: boolean;
}

const VARIANT_PAIRS: readonly VariantPair[] = [
  // Quy tắc đặt dấu thanh nguyên âm đôi âm tiết mở tiếng Việt (cả 2 đều chuẩn chính tả, không đổi nghĩa)
  { id: 'oa1', bit0: 'oà', bit1: 'òa', isTone: true },
  { id: 'oa2', bit0: 'oá', bit1: 'óa', isTone: true },
  { id: 'oa3', bit0: 'oả', bit1: 'ỏa', isTone: true },
  { id: 'oa4', bit0: 'oã', bit1: 'õa', isTone: true },
  { id: 'oa5', bit0: 'oạ', bit1: 'ọa', isTone: true },
  { id: 'oe1', bit0: 'oè', bit1: 'òe', isTone: true },
  { id: 'oe2', bit0: 'oé', bit1: 'óe', isTone: true },
  { id: 'oe3', bit0: 'oẻ', bit1: 'ỏe', isTone: true },
  { id: 'oe4', bit0: 'oẽ', bit1: 'õe', isTone: true },
  { id: 'oe5', bit0: 'oẹ', bit1: 'ọe', isTone: true },
  { id: 'uy1', bit0: 'uỳ', bit1: 'ùy', isTone: true },
  { id: 'uy2', bit0: 'uý', bit1: 'úy', isTone: true },
  { id: 'uy3', bit0: 'uỷ', bit1: 'ủy', isTone: true },
  { id: 'uy4', bit0: 'uỹ', bit1: 'ũy', isTone: true },
  { id: 'uy5', bit0: 'uỵ', bit1: 'ụy', isTone: true },
  // Cặp dấu câu đồng nghĩa trong văn xuôi
  { id: 'ell', bit0: '…', bit1: '...', isTone: false },
  { id: 'dsh', bit0: ' – ', bit1: ' — ', isTone: false },
];

const PAIR_BY_TOKEN = new Map<string, { pair: VariantPair; bit: 0 | 1 }>();
for (const pair of VARIANT_PAIRS) {
  PAIR_BY_TOKEN.set(pair.bit0, { pair, bit: 0 });
  PAIR_BY_TOKEN.set(pair.bit1, { pair, bit: 1 });
}

// Khớp âm tiết mở (không theo sau bởi chữ cái, loại trừ cụm "qu" với uy) + dấu ba chấm + gạch ngang
const SLOT_REGEX =
  /(?<![qQ])(?:u[ỳýỷỹỵ]|[ùúủũụ]y)(?![\p{L}])|(?:o[àáảãạèéẻẽẹ]|[òóỏõọ][ae])(?![\p{L}])|(?<!\.)\.\.\.(?!\.)|…| [–—] /gu;

function toBaseAsciiLetters(text: string): string {
  return text
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function resolveSlotBitIndex(fullText: string, start: number, end: number, pairId: string): number {
  const beforeSlice = fullText.slice(Math.max(0, start - 96), start);
  const afterSlice = fullText.slice(end, Math.min(fullText.length, end + 96));
  const beforeKey = toBaseAsciiLetters(beforeSlice).slice(-10);
  const afterKey = toBaseAsciiLetters(afterSlice).slice(0, 10);
  return fnv1a32(`${beforeKey}:${pairId}:${afterKey}`) & 31;
}

export async function deriveUserWatermarkBits(secret: string, discordUserId: string): Promise<number> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`forensic-v1:${discordUserId.trim()}`),
  );
  const view = new DataView(sig);
  return view.getUint32(0, false);
}

export function watermarkTextString(text: string, bits32: number): string {
  if (!text || text.length < 3) return text;
  SLOT_REGEX.lastIndex = 0;
  return text.replace(SLOT_REGEX, (matched, offset: number) => {
    const entry = PAIR_BY_TOKEN.get(matched);
    if (!entry) return matched;
    // Với nhóm uy*, chỉ biến đổi khi đứng sau phụ âm hợp lệ (vd tuỳ/tùy, thuỷ/thủy, luỹ/lũy, nguỵ/ngụy)
    if (entry.pair.id.startsWith('uy')) {
      const prevChar = offset > 0 ? text[offset - 1] : '';
      if (!/[tThHlLnNgGkKcCsS]/.test(prevChar)) return matched;
    }
    const bitIdx = resolveSlotBitIndex(text, offset, offset + matched.length, entry.pair.id);
    const bit = ((bits32 >>> bitIdx) & 1) as 0 | 1;
    return bit === 1 ? entry.pair.bit1 : entry.pair.bit0;
  });
}

function watermarkSpans(spans: WatermarkInlineSpan[], bits32: number): WatermarkInlineSpan[] {
  if (spans.length === 0) return spans;
  if (spans.length === 1) {
    return [{ ...spans[0], t: watermarkTextString(spans[0].t, bits32) }];
  }
  // Nối toàn đoạn để ngữ cảnh trước/sau chính xác ngay cả khi tách span đậm/nghiêng
  const combined = spans.map((s) => s.t).join('');
  SLOT_REGEX.lastIndex = 0;
  const replacements: Array<{ start: number; end: number; next: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = SLOT_REGEX.exec(combined)) !== null) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    const entry = PAIR_BY_TOKEN.get(token);
    if (!entry) continue;
    if (entry.pair.id.startsWith('uy')) {
      const prevChar = start > 0 ? combined[start - 1] : '';
      if (!/[tThHlLnNgGkKcCsS]/.test(prevChar)) continue;
    }
    const bitIdx = resolveSlotBitIndex(combined, start, end, entry.pair.id);
    const bit = ((bits32 >>> bitIdx) & 1) as 0 | 1;
    const next = bit === 1 ? entry.pair.bit1 : entry.pair.bit0;
    if (next !== token) replacements.push({ start, end, next });
  }
  if (replacements.length === 0) return spans;

  let cursor = 0;
  let repIdx = 0;
  return spans.map((span) => {
    const spanStart = cursor;
    const spanEnd = cursor + span.t.length;
    cursor = spanEnd;
    let out = '';
    let localPos = 0;
    while (repIdx < replacements.length && replacements[repIdx].end <= spanStart) {
      repIdx += 1;
    }
    let k = repIdx;
    while (k < replacements.length && replacements[k].start < spanEnd) {
      const rep = replacements[k];
      if (rep.start >= spanStart && rep.end <= spanEnd) {
        out += span.t.slice(localPos, rep.start - spanStart) + rep.next;
        localPos = rep.end - spanStart;
      }
      k += 1;
    }
    if (localPos === 0) return span;
    out += span.t.slice(localPos);
    return { ...span, t: out };
  });
}

export function applyForensicWatermarkToBlocks(
  blocks: WatermarkBlock[],
  bits32: number,
): WatermarkBlock[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case 'h':
      case 'p':
      case 'quote':
        return { ...block, spans: watermarkSpans(block.spans, bits32) };
      case 'list':
        return {
          ...block,
          items: block.items.map((item) => watermarkSpans(item, bits32)),
        };
      default:
        return block;
    }
  });
}

export interface ExtractedObservation {
  bitIdx: number;
  bit: 0 | 1;
  isTone: boolean;
}

export function extractForensicObservations(rawText: string): ExtractedObservation[] {
  const normalized = rawText.normalize('NFC');
  const observations: ExtractedObservation[] = [];
  SLOT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLOT_REGEX.exec(normalized)) !== null) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    const entry = PAIR_BY_TOKEN.get(token);
    if (!entry) continue;
    if (entry.pair.id.startsWith('uy')) {
      const prevChar = start > 0 ? normalized[start - 1] : '';
      if (!/[tThHlLnNgGkKcCsS]/.test(prevChar)) continue;
    }
    const bitIdx = resolveSlotBitIndex(normalized, start, end, entry.pair.id);
    observations.push({ bitIdx, bit: entry.bit, isTone: entry.pair.isTone });
  }
  return observations;
}

export async function matchForensicCandidates(
  rawText: string,
  candidates: ForensicCandidateInput[],
  secret: string,
): Promise<{ totalSlots: number; toneSlots: number; results: ForensicMatchResult[] }> {
  const observations = extractForensicObservations(rawText);
  const totalSlots = observations.length;
  const toneSlots = observations.filter((o) => o.isTone).length;
  if (totalSlots === 0 || candidates.length === 0) {
    return { totalSlots, toneSlots, results: [] };
  }

  const results: ForensicMatchResult[] = [];
  for (const cand of candidates) {
    const bits32 = await deriveUserWatermarkBits(secret, cand.discordUserId);
    let matchedSlots = 0;
    let toneMatchedSlots = 0;
    for (const obs of observations) {
      const expected = ((bits32 >>> obs.bitIdx) & 1) as 0 | 1;
      if (expected === obs.bit) {
        matchedSlots += 1;
        if (obs.isTone) toneMatchedSlots += 1;
      }
    }
    const matchPercent = Math.round((matchedSlots / totalSlots) * 1000) / 10;
    const toneMatchPercent =
      toneSlots > 0 ? Math.round((toneMatchedSlots / toneSlots) * 1000) / 10 : matchPercent;
    // Nếu AI OCR chuẩn hoá dấu ba chấm thành "...", kênh dấu thanh tiếng Việt vẫn giữ nguyên độ chính xác cao
    const scorePercent =
      toneSlots >= 8 ? Math.max(matchPercent, toneMatchPercent) : matchPercent;
    results.push({
      discordUserId: cand.discordUserId,
      discordUsername: cand.discordUsername,
      matchedSlots,
      totalSlots,
      matchPercent,
      toneMatchedSlots,
      toneTotalSlots: toneSlots,
      toneMatchPercent,
      scorePercent,
    });
  }

  results.sort((a, b) => b.scorePercent - a.scorePercent || b.matchedSlots - a.matchedSlots);
  return { totalSlots, toneSlots, results };
}
