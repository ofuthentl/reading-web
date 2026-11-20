export type BookFileType = 'epub' | 'mobi' | 'pdf' | 'cbz';

export type Book = {
  id: string;
  title: string;
  author: string;
  shelf: string;
  description: string | null;
  cover_color: string;
  cover_key: string | null;
  file_key: string;
  file_type: BookFileType;
  file_size: number;
  cover_size: number;
  created_at: string;
};

export type Chapter = {
  id: string;
  book_id: string;
  title: string;
  content: string;
  content_html?: string;
  chapter_number: number;
  pdf_page_number?: number;
};

export type ParsedBook = {
  chapters: Chapter[];
  /** Present for PDF books: a local Blob URL ready for PdfReader */
  pdfBlobUrl?: string;
  /** Revokes all Object URLs created while parsing this book (prevents memory leaks) */
  dispose: () => void;
};

export type ReadingProgress = {
  chapterId: string;
  chapterIndex: number;
  scrollRatio: number;
  scrollTop: number;
  completed: boolean;
  updatedAt: number;
};

export type StorageStats = {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  bookCount: number;
};

export type ShelfGroup = {
  key: string;
  name: string;
  books: Book[];
};

export type ReaderTheme = 'paper' | 'sepia' | 'dark' | 'midnight';
export type ReaderFont = 'serif' | 'sans' | 'mono';
export type ReaderWidth = 'narrow' | 'medium' | 'wide';

export type ReaderSettings = {
  theme: ReaderTheme;
  font: ReaderFont;
  fontSizePx: number;
  lineHeight: number;
  width: ReaderWidth;
  sideTapNavigation: boolean;
};

export type ViewMode = '3d' | '2d';
