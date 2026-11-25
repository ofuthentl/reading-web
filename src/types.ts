export type BookFileType = 'epub' | 'docx';

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
  guest_locked?: boolean;
};

export type Chapter = {
  id: string;
  book_id: string;
  title: string;
  content: string;
  content_html?: string;
  chapter_number: number;
  locked?: boolean;
};

export type ParsedBook = {
  chapters: Chapter[];
  /** Giải nén lười (song song) toàn bộ ảnh minh hoạ của 1 chương nếu chưa bung */
  ensureChapterMedia?: (
    chapterIndex: number,
    options?: { prefetch?: boolean },
  ) => Promise<Chapter | undefined>;
  /** Giải nén lười 1 ảnh minh hoạ theo đường dẫn trong tệp ZIP (dùng cho Tab Minh hoạ) */
  resolveMediaUrl?: (zipPath: string) => Promise<string | null>;
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
  bookPercent?: number;
  readingSeconds?: number;
  rereadCount?: number;
  updatedAt: number;
};

export type SaveProgressOptions = {
  readingDeltaSec?: number;
  rereadCount?: number;
  keepalive?: boolean;
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
export type ReaderFontWeight = 'normal' | 'semibold' | 'bold';
export type ReaderWidth = 'narrow' | 'medium' | 'wide';
export type ReaderLayoutMode = 'scroll' | 'paginated';
export type ReaderTextAlign = 'justify' | 'left';
export type ReaderParagraphSpacing = 'compact' | 'normal' | 'relaxed';
export type ReaderEyeBreakMinutes = 0 | 30 | 45 | 60;

export type ReaderSettings = {
  theme: ReaderTheme;
  font: ReaderFont;
  fontWeight: ReaderFontWeight;
  fontSizePx: number;
  lineHeight: number;
  width: ReaderWidth;
  layoutMode: ReaderLayoutMode;
  sideTapNavigation: boolean;
  textAlign: ReaderTextAlign;
  paragraphIndent: boolean;
  paragraphSpacing: ReaderParagraphSpacing;
  nightDimPercent: number;
  readingRuler: boolean;
  dailyGoalMinutes: number;
  eyeBreakMinutes: ReaderEyeBreakMinutes;
};

export type LibraryTab = 'home' | 'library' | 'support';
export type LibraryStatusFilter = 'all' | 'reading' | 'unread' | 'plan_to_read' | 'completed';
export type LibrarySortMode =
  | 'title_asc'
  | 'recent_upload'
  | 'recent_read'
  | 'volume_desc'
  | 'rating_desc';
export type TagMatchMode = 'all' | 'any';
export type TagFilterState = 'none' | 'include' | 'exclude';

export type ShelfRatingSummary = {
  average: number;
  count: number;
};

export type CustomCollection = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  shelfKeys: string[];
  createdAt: number;
  updatedAt: number;
};

export type AniListNovelCandidate = {
  anilistId: number;
  primaryTitle: string;
  titles: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  altTitles: string[];
  author: string | null;
  description: string | null;
  mappedTags: string[];
  volumes: number | null;
  year: number | null;
  status: string | null;
};

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
  rt?: string;
};

export type GuestBlock =
  | { kind: 'h'; level: 1 | 2 | 3; spans: GuestInlineSpan[] }
  | { kind: 'p'; spans: GuestInlineSpan[] }
  | { kind: 'quote'; spans: GuestInlineSpan[] }
  | { kind: 'list'; ordered?: 1; plain?: 1; depths?: number[]; items: GuestInlineSpan[][] }
  | { kind: 'hr' }
  | { kind: 'img'; mediaIndex: number; alt?: string };

export type GuestTocItem = {
  id: string;
  title: string;
  chapterNumber: number;
  compressedBytes?: number;
  locked?: boolean;
};

export type GuestChapterPayload = {
  id: string;
  title: string;
  chapterNumber: number;
  watermarkLabel: string;
  blocks: GuestBlock[];
  footnotes?: Record<string, string>;
};

export type GuestBookIllustrationItem = {
  mediaIndex: number;
  chapterIndex: number;
  chapterNumber: number;
  chapterTitle: string;
  alt: string | null;
};

export type HighlightColor = 'amber' | 'emerald' | 'sky' | 'rose';

export type HighlightLocator = {
  blockIndex?: number;
  startOffset?: number;
  endOffset?: number;
  scrollRatio?: number;
};

export type BookHighlight = {
  id: string;
  bookId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle?: string;
  quoteText: string;
  note: string | null;
  color: HighlightColor;
  locator: HighlightLocator | null;
  createdAt: number;
};

export type LibraryHighlightItem = BookHighlight & {
  bookTitle: string;
  bookAuthor: string;
  shelf: string;
  coverKey: string | null;
  coverColor: string;
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

export type ShelfAccessMode = 'public' | 'restricted';

export type ShelfAccessSummary = {
  mode: 'restricted';
  allowedCount: number;
};

export type ShelfAccessGrantUser = {
  discordUserId: string;
  label: string | null;
  discordUsername?: string | null;
  createdAt?: number;
};

export type ShelfAccessRuleDetail = {
  shelfKey: string;
  mode: 'restricted';
  updatedAt: number;
  allowedUsers: ShelfAccessGrantUser[];
};

export type BookAccessMode = 'inherit' | 'public' | 'restricted';

export type BookAccessSummary = {
  mode: BookAccessMode;
  allowedCount: number;
  lockedChapterCount: number;
};

export type ShelfRelationType = 'sequel' | 'spinoff' | 'same_universe';
export type ShelfRelationInputType = ShelfRelationType | 'prequel' | 'main_story';

export type ShelfRelation = {
  sourceShelfKey: string;
  targetShelfKey: string;
  relationType: ShelfRelationType;
  createdAt: number;
};

export type CommunityTargetType = 'shelf' | 'book';

export type CommunityReactionEmoji = 'fire' | 'cry' | 'laugh' | 'heart' | 'mindblown';

export type CommunityComment = {
  id: string;
  authorName: string;
  authorRole: AuthRole;
  content: string;
  parentId?: string | null;
  chapterNumber?: number | null;
  createdAt: number;
  updatedAt: number;
  isEdited?: boolean;
  isMine: boolean;
  canEdit?: boolean;
  canDelete: boolean;
  reactions?: Partial<Record<CommunityReactionEmoji, number>>;
  myReactions?: CommunityReactionEmoji[];
};

export type CommunitySummary = {
  targetType: CommunityTargetType;
  targetKey: string;
  averageRating: number | null;
  ratingCount: number;
  myRating: number | null;
  comments: CommunityComment[];
  totalComments: number;
};
