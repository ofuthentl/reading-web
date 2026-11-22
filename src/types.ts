export type BookFileType = 'epub' | 'pdf' | 'docx';

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
  guest_ready?: boolean;
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
  chapterTitle?: string;
  totalChapters?: number;
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
export type LibraryTab = 'home' | 'library';
export type LibraryStatusFilter = 'all' | 'reading' | 'unread' | 'completed';
export type LibraryFormatFilter = 'all' | BookFileType;
export type LibrarySortMode = 'title_asc' | 'recent_upload' | 'recent_read' | 'volume_desc';

export type AuthRole = 'owner' | 'guest';

export type AuthSessionInfo = {
  role: AuthRole;
  expiresAt: number | null;
  watermarkLabel?: string | null;
};

export type GuestInlineSpan = {
  t: string;
  b?: 1;
  i?: 1;
};

export type GuestBlock =
  | { kind: 'h'; level: 1 | 2 | 3; spans: GuestInlineSpan[] }
  | { kind: 'p'; spans: GuestInlineSpan[] }
  | { kind: 'quote'; spans: GuestInlineSpan[] }
  | { kind: 'list'; ordered?: 1; items: GuestInlineSpan[][] }
  | { kind: 'hr' }
  | { kind: 'img'; mediaIndex: number; alt?: string };

export type GuestTocItem = {
  id: string;
  title: string;
  chapterNumber: number;
};

export type GuestChapterPayload = {
  id: string;
  title: string;
  chapterNumber: number;
  watermarkLabel: string;
  blocks: GuestBlock[];
};

export type BookBookmark = {
  id: string;
  bookId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle?: string;
  scrollRatio: number;
  label: string;
  note: string | null;
  createdAt: number;
};

export type GuestBookSearchMatch = {
  chapterIndex: number;
  chapterNumber: number;
  chapterTitle: string;
  matchCount: number;
};
