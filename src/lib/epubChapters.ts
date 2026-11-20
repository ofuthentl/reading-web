import type { Chapter } from '@/types';

export interface RawEpubSection {
  tocTitle: string | null;
  filenameTitle: string | null;
  headingTitle: string | null;
  bodyHtml: string;
  plainText: string;
  hasMedia: boolean;
}

const MAIN_CONTENT_BOUNDARY_RE =
  /^(?:khúc\s+dạo\s+đầu|mục\s+lục|mở\s+đầu|lời\s+mở\s+đầu|lời\s+nói\s+đầu|lời\s+tựa|lời\s+bạt|dẫn\s+nhập|giới\s+thiệu|tựa|chương\b|hồi\b|phần\b|quyển\b|tập\b|lời\s+kết|ngoại\s+truyện|phụ\s+lục|prologue\b|opening\b|table\s+of\s+contents\b|contents\b|toc\b|preface\b|foreword\b|introduction\b|chapter\b|part\b|act\b|episode\b|interlude\b|epilogue\b|afterword\b)/i;

const ILLUSTRATION_TITLE_RE =
  /^(?:minh\s*h[ọo]a|hình\s*minh\s*h[ọo]a|ảnh\s*minh\s*h[ọo]a|bìa|ảnh\s*bìa|cover|illustration|illustrations|color|colour|insert|gallery|frontispiece)(?:\s*[-_:#]?\s*\d*)?$/i;

const PROSE_LENGTH_BOUNDARY = 250;
const IMAGE_ONLY_PART_SIZE = 25;

interface ChapterBuilder {
  title: string;
  htmlParts: string[];
  textParts: string[];
}

function cleanHeading(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || !/[\p{L}\p{N}]/u.test(trimmed)) return null;
  return trimmed;
}

function isIllustrationOnly(section: RawEpubSection): boolean {
  if (!section.hasMedia) return false;
  if (!section.plainText) return true;
  const label = section.tocTitle || section.filenameTitle || section.headingTitle || '';
  return section.plainText.length <= 40 && ILLUSTRATION_TITLE_RE.test(label.trim());
}

function getExplicitTitle(section: RawEpubSection): string | null {
  return (
    cleanHeading(section.tocTitle) ||
    cleanHeading(section.filenameTitle) ||
    cleanHeading(section.headingTitle)
  );
}

function isMainContentBoundary(section: RawEpubSection): boolean {
  const title = getExplicitTitle(section);
  if (title && MAIN_CONTENT_BOUNDARY_RE.test(title)) return true;
  return section.plainText.length >= PROSE_LENGTH_BOUNDARY;
}

function resolveNewChapterTitle(
  section: RawEpubSection,
  currentTitle: string | null,
  hasStructuredToc: boolean,
  hasFilenameChapters: boolean,
): string | null {
  if (isIllustrationOnly(section)) return null;

  const toc = cleanHeading(section.tocTitle);
  if (toc && !ILLUSTRATION_TITLE_RE.test(toc)) {
    return toc !== currentTitle ? toc : null;
  }

  const fileTitle = cleanHeading(section.filenameTitle);
  if (fileTitle && !ILLUSTRATION_TITLE_RE.test(fileTitle)) {
    return fileTitle !== currentTitle ? fileTitle : null;
  }

  const heading = cleanHeading(section.headingTitle);
  if (heading && !ILLUSTRATION_TITLE_RE.test(heading)) {
    if (MAIN_CONTENT_BOUNDARY_RE.test(heading)) {
      return heading !== currentTitle ? heading : null;
    }
    if (!hasStructuredToc && !hasFilenameChapters) {
      return heading !== currentTitle ? heading : null;
    }
  }

  return null;
}

function buildImageOnlyEpubChapters(sections: RawEpubSection[], bookId: string): Chapter[] {
  const partCount = Math.ceil(sections.length / IMAGE_ONLY_PART_SIZE);
  const chapters: Chapter[] = [];
  for (let part = 0; part < partCount; part += 1) {
    const slice = sections.slice(part * IMAGE_ONLY_PART_SIZE, (part + 1) * IMAGE_ONLY_PART_SIZE);
    const startPage = part * IMAGE_ONLY_PART_SIZE + 1;
    const endPage = part * IMAGE_ONLY_PART_SIZE + slice.length;
    chapters.push({
      id: `${bookId}-epub-${part}`,
      book_id: bookId,
      title: partCount === 1 ? 'Minh họa' : `Trang ${startPage} – ${endPage}`,
      content: '',
      content_html: slice.map((s) => `<section class="epub-file">${s.bodyHtml}</section>`).join(''),
      chapter_number: part + 1,
    });
  }
  return chapters;
}

/**
 * Chuẩn hoá danh sách chương EPUB:
 * 1. Trước khi gặp mốc nội dung chính đầu tiên (Khúc dạo đầu, Mục lục, Mở đầu, Chương X...):
 *    gom toàn bộ trang ảnh minh họa thành duy nhất 1 mục tên "Minh họa".
 * 2. Khi đã vào chương: KHÔNG tách nhỏ chương — mọi trang ảnh minh họa giữa chương và các tệp
 *    văn bản nối tiếp chưa tới chương mới đều được tích hợp liền mạch ngay trong chương hiện tại.
 */
export function buildEpubChapters(sections: RawEpubSection[], bookId: string): Chapter[] {
  if (sections.length === 0) return [];

  if (sections.every((section) => section.hasMedia && !section.plainText)) {
    return buildImageOnlyEpubChapters(sections, bookId);
  }

  const openingMediaHtml: string[] = [];
  const mainSections: RawEpubSection[] = [];
  let reachedMainContent = false;

  for (const section of sections) {
    if (!reachedMainContent && isMainContentBoundary(section)) {
      reachedMainContent = true;
    }
    if (!reachedMainContent && isIllustrationOnly(section)) {
      openingMediaHtml.push(`<section class="epub-file">${section.bodyHtml}</section>`);
      continue;
    }
    mainSections.push(section);
  }

  const tocNamedCount = mainSections.filter((s) => {
    const t = cleanHeading(s.tocTitle);
    return Boolean(t && !ILLUSTRATION_TITLE_RE.test(t));
  }).length;
  const filenameNamedCount = mainSections.filter((s) => Boolean(cleanHeading(s.filenameTitle))).length;
  const headingNamedCount = mainSections.filter((s) => {
    const h = cleanHeading(s.headingTitle);
    return Boolean(h && !ILLUSTRATION_TITLE_RE.test(h));
  }).length;

  const hasStructuredToc = tocNamedCount >= 2;
  const hasFilenameChapters = filenameNamedCount >= 2;
  const hasAnyNamedBoundary = tocNamedCount + filenameNamedCount + headingNamedCount > 0;

  const builders: ChapterBuilder[] = [];
  let inNamedChapter = false;

  for (const section of mainSections) {
    const wrappedHtml = `<section class="epub-file">${section.bodyHtml}</section>`;
    const current = builders[builders.length - 1] ?? null;

    if (!hasAnyNamedBoundary) {
      if (isIllustrationOnly(section) && current) {
        current.htmlParts.push(wrappedHtml);
      } else {
        builders.push({
          title: `Chương ${builders.length + 1}`,
          htmlParts: [wrappedHtml],
          textParts: section.plainText ? [section.plainText] : [],
        });
      }
      continue;
    }

    const nextTitle = resolveNewChapterTitle(
      section,
      current?.title ?? null,
      hasStructuredToc,
      hasFilenameChapters,
    );

    if (nextTitle) {
      builders.push({
        title: nextTitle,
        htmlParts: [wrappedHtml],
        textParts: section.plainText ? [section.plainText] : [],
      });
      inNamedChapter = true;
    } else if (current && (inNamedChapter || isIllustrationOnly(section))) {
      // Ảnh minh họa giữa chương hoặc phần tiếp nối của cùng 1 chương → tích hợp luôn vào chương hiện tại
      current.htmlParts.push(wrappedHtml);
      if (section.plainText) current.textParts.push(section.plainText);
    } else {
      const fallbackTitle = getExplicitTitle(section) || `Chương ${builders.length + 1}`;
      builders.push({
        title: fallbackTitle,
        htmlParts: [wrappedHtml],
        textParts: section.plainText ? [section.plainText] : [],
      });
      if (section.plainText.length >= PROSE_LENGTH_BOUNDARY) {
        inNamedChapter = true;
      }
    }
  }

  const chapters: Chapter[] = [];
  if (openingMediaHtml.length > 0) {
    chapters.push({
      id: `${bookId}-epub-0`,
      book_id: bookId,
      title: 'Minh họa',
      content: '',
      content_html: openingMediaHtml.join(''),
      chapter_number: 1,
    });
  }

  for (const builder of builders) {
    const index = chapters.length;
    chapters.push({
      id: `${bookId}-epub-${index}`,
      book_id: bookId,
      title: builder.title,
      content: builder.textParts.join('\n\n').trim(),
      content_html: builder.htmlParts.join(''),
      chapter_number: index + 1,
    });
  }

  return chapters;
}
