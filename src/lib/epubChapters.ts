import type { Chapter } from '@/types';

export interface RawEpubSection {
  explicitTitle: string | null;
  bodyHtml: string;
  plainText: string;
  hasMedia: boolean;
}

const MAIN_CONTENT_BOUNDARY_RE =
  /^(?:khúc\s+dạo\s+đầu|mục\s+lục|mở\s+đầu|lời\s+mở\s+đầu|lời\s+nói\s+đầu|lời\s+tựa|dẫn\s+nhập|giới\s+thiệu|tựa|chương\b|hồi\b|phần\b|quyển\b|tập\b|lời\s+kết|ngoại\s+truyện|phụ\s+lục|prologue\b|opening\b|table\s+of\s+contents\b|contents\b|toc\b|preface\b|foreword\b|introduction\b|chapter\b|part\b|act\b|episode\b|interlude\b|epilogue\b|afterword\b)/i;

const ILLUSTRATION_TITLE_RE =
  /^(?:minh\s*h[ọo]a|ảnh\s*minh\s*h[ọo]a|bìa|ảnh\s*bìa|cover|illustration|illustrations|color|colour|insert|gallery|frontispiece)(?:\s*[-_:#]?\s*\d*)?$/i;

const PROSE_LENGTH_BOUNDARY = 250;

function isMainContentBoundary(section: RawEpubSection): boolean {
  if (section.explicitTitle && MAIN_CONTENT_BOUNDARY_RE.test(section.explicitTitle.trim())) {
    return true;
  }
  return section.plainText.length >= PROSE_LENGTH_BOUNDARY;
}

function isIllustrationSection(section: RawEpubSection): boolean {
  if (!section.hasMedia) return false;
  if (!section.plainText) return true;
  return (
    section.plainText.length <= 40 &&
    Boolean(section.explicitTitle && ILLUSTRATION_TITLE_RE.test(section.explicitTitle.trim()))
  );
}

/**
 * Gộp toàn bộ trang ảnh minh hoạ ở đầu EPUB (cho tới trước khi gặp Khúc dạo đầu,
 * Mục lục, Mở đầu, Chương X... hoặc nội dung văn xuôi chính) thành duy nhất 1 mục tên "Minh họa".
 */
export function buildEpubChapters(sections: RawEpubSection[], bookId: string): Chapter[] {
  const openingMediaHtml: string[] = [];
  const remainingSections: RawEpubSection[] = [];
  let reachedMainContent = false;

  for (const section of sections) {
    if (!reachedMainContent && isMainContentBoundary(section)) {
      reachedMainContent = true;
    }

    if (!reachedMainContent && isIllustrationSection(section)) {
      openingMediaHtml.push(`<section class="epub-file">${section.bodyHtml}</section>`);
      continue;
    }

    remainingSections.push(section);
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

  for (const section of remainingSections) {
    const index = chapters.length;
    const title =
      section.explicitTitle ||
      (section.hasMedia && !section.plainText ? `Minh họa ${index + 1}` : `Chương ${index + 1}`);

    chapters.push({
      id: `${bookId}-epub-${index}`,
      book_id: bookId,
      title,
      content: section.plainText,
      content_html: `<section class="epub-file">${section.bodyHtml}</section>`,
      chapter_number: index + 1,
    });
  }

  return chapters;
}
