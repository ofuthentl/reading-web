export type SpoilerTextSegment =
  | { type: 'text'; text: string }
  | { type: 'spoiler'; text: string; spoilerIndex: number };

const SPOILER_PATTERN = /\|\|([\s\S]*?)\|\|/g;

/**
 * Parse cú pháp `||nội dung spoiler||` thành các đoạn thuần văn bản cho React render trực tiếp
 * (tuyệt đối không dùng dangerouslySetInnerHTML, 0 nguy cơ XSS).
 */
export function parseSpoilerSegments(input: string): SpoilerTextSegment[] {
  if (!input) return [];

  const segments: SpoilerTextSegment[] = [];
  let lastIndex = 0;
  let spoilerIndex = 0;
  SPOILER_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null = SPOILER_PATTERN.exec(input);
  while (match !== null) {
    const fullMatch = match[0];
    const inner = match[1];
    const matchStart = match.index;

    if (matchStart > lastIndex) {
      segments.push({ type: 'text', text: input.slice(lastIndex, matchStart) });
    }

    if (inner.trim().length > 0) {
      segments.push({
        type: 'spoiler',
        text: inner,
        spoilerIndex,
      });
      spoilerIndex += 1;
    } else {
      segments.push({ type: 'text', text: fullMatch });
    }

    lastIndex = matchStart + fullMatch.length;
    match = SPOILER_PATTERN.exec(input);
  }

  if (lastIndex < input.length) {
    segments.push({ type: 'text', text: input.slice(lastIndex) });
  }

  return segments;
}

export function insertSpoilerSyntax(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { nextValue: string; nextSelectionStart: number; nextSelectionEnd: number } {
  const safeStart = Math.max(0, Math.min(selectionStart, value.length));
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, value.length));
  const before = value.slice(0, safeStart);
  const selected = value.slice(safeStart, safeEnd);
  const after = value.slice(safeEnd);

  if (selected.length > 0) {
    const wrapped = `||${selected}||`;
    const caret = before.length + wrapped.length;
    return {
      nextValue: `${before}${wrapped}${after}`,
      nextSelectionStart: caret,
      nextSelectionEnd: caret,
    };
  }

  const placeholder = 'nội dung spoiler';
  const inserted = `||${placeholder}||`;
  return {
    nextValue: `${before}${inserted}${after}`,
    nextSelectionStart: before.length + 2,
    nextSelectionEnd: before.length + 2 + placeholder.length,
  };
}
