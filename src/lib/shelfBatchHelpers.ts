import type { AniListNovelCandidate, Book, ShelfGroup } from '@/types';
import { isAuthError, updateBookMetadata } from '@/lib/api';
import { isReleaseMetadataNoise } from '@/lib/authorHeuristics';
import { getBookSortTitle, getDisplayAuthor } from '@/lib/bookMetadata';
import { setShelfAltTitles } from '@/lib/catalogApi';
import {
  extractBookAutoAuthor,
  extractBookAutoDescription,
} from '@/lib/epubSummaryExtractor';
import { normalizeClientAltTitles, normalizeClientShelfTags } from '@/lib/shelfPrefs';
import {
  UNKNOWN_AUTHOR_LABEL,
  getEffectiveAuthorInShelf,
  getHealedTitleInShelf,
} from '@/lib/shelfSummary';
import { setShelfTags } from '@/lib/shelfTagPresets';
import type { ToastType } from '@/hooks/useToast';

export type BatchMetadataJob = {
  book: Book;
  patch: Partial<Pick<Book, 'title' | 'author' | 'description'>>;
};

export function splitAltTitleInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((item) => item.normalize('NFC').trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

export function computeShelfAuthorAnalysis(shelf: ShelfGroup | null): {
  rawAuthorCounts: Map<string, number>;
  missingAuthorBooks: Book[];
  knownAuthorsInShelf: string[];
} {
  const rawAuthorCounts = new Map<string, number>();
  if (!shelf) {
    return { rawAuthorCounts, missingAuthorBooks: [], knownAuthorsInShelf: [] };
  }
  for (const b of shelf.books) {
    const raw = b.author.normalize('NFC').trim();
    if (
      !raw ||
      raw === UNKNOWN_AUTHOR_LABEL ||
      isReleaseMetadataNoise(raw) ||
      getDisplayAuthor(b.author, b.title) === UNKNOWN_AUTHOR_LABEL
    ) {
      continue;
    }
    const k = raw.toLocaleLowerCase('vi');
    rawAuthorCounts.set(k, (rawAuthorCounts.get(k) ?? 0) + 1);
  }
  const missingAuthorBooks: Book[] = [];
  const knownSet = new Set<string>();
  for (const b of shelf.books) {
    const clean = getEffectiveAuthorInShelf(b, shelf, rawAuthorCounts);
    if (clean === UNKNOWN_AUTHOR_LABEL) {
      missingAuthorBooks.push(b);
    } else if (clean) {
      knownSet.add(clean);
    }
  }
  return {
    rawAuthorCounts,
    missingAuthorBooks,
    knownAuthorsInShelf: Array.from(knownSet),
  };
}

export function buildAuthorSyncJobs(
  targetBooks: readonly Book[],
  shelf: ShelfGroup,
  rawAuthorCounts: ReadonlyMap<string, number>,
  nextAuthorRaw: string,
): BatchMetadataJob[] {
  const nextAuthor = nextAuthorRaw.trim() || UNKNOWN_AUTHOR_LABEL;
  const jobs: BatchMetadataJob[] = [];
  for (const book of targetBooks) {
    const healedTitle = getHealedTitleInShelf(book, shelf, rawAuthorCounts);
    const titleNeedsHeal = healedTitle !== book.title;
    if (!titleNeedsHeal && book.author === nextAuthor) continue;
    jobs.push({
      book,
      patch: titleNeedsHeal ? { title: healedTitle, author: nextAuthor } : { author: nextAuthor },
    });
  }
  return jobs;
}

export async function executeBatchMetadataJobs(
  jobs: readonly BatchMetadataJob[],
  isMounted: () => boolean,
  onProgress: (done: number) => void,
): Promise<{
  updatedBooks: Book[];
  firstError: unknown;
}> {
  const updatedBooks: Book[] = [];
  let firstError: unknown = null;
  let authExpired = false;
  const CONCURRENCY = 4;

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    if (!isMounted() || authExpired) break;
    const slice = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map((job) => updateBookMetadata(job.book.id, job.patch)),
    );
    for (const res of results) {
      if (res.status === 'fulfilled') updatedBooks.push(res.value);
      else {
        if (!firstError) firstError = res.reason;
        if (isAuthError(res.reason)) authExpired = true;
      }
    }
    if (isMounted()) onProgress(Math.min(jobs.length, i + slice.length));
  }

  return { updatedBooks, firstError };
}

export async function applyAndSaveFullAniListCandidate(params: {
  shelf: ShelfGroup;
  candidate: AniListNovelCandidate;
  currentAltTitles: readonly string[];
  currentTags: readonly string[];
  overwriteExistingDesc: boolean;
  rawAuthorCounts: ReadonlyMap<string, number>;
  isMounted: () => boolean;
  onTotalJobs: (total: number) => void;
  onProgress: (done: number) => void;
  onAltTitlesSaved?: (shelfName: string, altTitles: string[]) => void;
  onTagsSaved?: (shelfName: string, tags: string[]) => void;
  onBooksUpdated: (books: Book[]) => void;
}): Promise<string[]> {
  const {
    shelf,
    candidate,
    currentAltTitles,
    currentTags,
    overwriteExistingDesc,
    rawAuthorCounts,
    isMounted,
    onTotalJobs,
    onProgress,
    onAltTitlesSaved,
    onTagsSaved,
    onBooksUpdated,
  } = params;

  const mergedAlt = normalizeClientAltTitles([...currentAltTitles, ...candidate.altTitles]);
  const mergedTags = normalizeClientShelfTags([...currentTags, ...candidate.mappedTags]);

  let finalAlt = mergedAlt;
  if (onAltTitlesSaved && mergedAlt.length > 0) {
    finalAlt = await setShelfAltTitles(shelf.name, mergedAlt);
    onAltTitlesSaved(shelf.name, finalAlt);
  }
  if (onTagsSaved && mergedTags.length > 0) {
    const savedTags = await setShelfTags(shelf.name, mergedTags);
    onTagsSaved(shelf.name, savedTags);
  }

  const desc = candidate.description?.trim() || '';
  const nextAuthor = candidate.author?.trim() || '';
  const jobs: BatchMetadataJob[] = [];
  for (const book of shelf.books) {
    const healedTitle = getHealedTitleInShelf(book, shelf, rawAuthorCounts);
    const patch: BatchMetadataJob['patch'] = {};
    if (healedTitle !== book.title) patch.title = healedTitle;
    if (nextAuthor && book.author !== nextAuthor) patch.author = nextAuthor;
    if (desc && (!book.description?.trim() || overwriteExistingDesc)) {
      if ((book.description?.trim() ?? '') !== desc) patch.description = desc;
    }
    if (Object.keys(patch).length > 0) jobs.push({ book, patch });
  }

  if (jobs.length > 0) {
    onTotalJobs(jobs.length);
    const { updatedBooks, firstError } = await executeBatchMetadataJobs(
      jobs,
      isMounted,
      onProgress,
    );
    if (updatedBooks.length > 0) onBooksUpdated(updatedBooks);
    if (firstError) throw firstError;
  }

  return finalAlt;
}

export async function runShelfEpubAutoExtract(params: {
  mode: 'shared' | 'per-volume' | 'author' | 'alt-titles';
  shelf: ShelfGroup;
  listedVolumes: readonly Book[];
  draftById: Record<string, string>;
  onAuthorExtracted: (creator: string) => void;
  onSharedExtracted: (desc: string) => void;
  onDraftsUpdated: (next: Record<string, string>) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}): Promise<void> {
  const {
    mode,
    shelf,
    listedVolumes,
    draftById,
    onAuthorExtracted,
    onSharedExtracted,
    onDraftsUpdated,
    onNotify,
  } = params;

  const epubBooks = shelf.books.filter((b) => b.file_type === 'epub');
  if (epubBooks.length === 0) {
    onNotify?.('Kệ này không có tệp EPUB để tự trích dữ liệu.', 'info');
    return;
  }

  if (mode === 'author') {
    for (const candidate of epubBooks.slice(0, 3)) {
      const creator = await extractBookAutoAuthor(candidate);
      if (creator) {
        onAuthorExtracted(creator);
        onNotify?.(`Đã trích tên tác giả "${creator}" từ tệp EPUB.`, 'success');
        return;
      }
    }
    onNotify?.('Tệp EPUB không nhúng sẵn thông tin tác giả trong thẻ <dc:creator>.', 'info');
    return;
  }

  if (mode === 'shared' || mode === 'alt-titles') {
    for (const candidate of epubBooks.slice(0, 3)) {
      const extracted = await extractBookAutoDescription(candidate);
      if (extracted) {
        onSharedExtracted(extracted);
        onNotify?.(
          `Đã trích nội dung giới thiệu từ "${getBookSortTitle(candidate)}".`,
          'success',
        );
        return;
      }
    }
    onNotify?.('Không tìm thấy mục giới thiệu/tóm tắt tự động trong tệp EPUB đầu bộ.', 'info');
    return;
  }

  const candidates = listedVolumes.filter(
    (b) => b.file_type === 'epub' && !draftById[b.id]?.trim(),
  );
  if (candidates.length === 0) {
    onNotify?.('Không có tập EPUB trống nào cần trích tự động.', 'info');
    return;
  }
  let filled = 0;
  const nextDrafts = { ...draftById };
  for (const book of candidates) {
    try {
      const text = await extractBookAutoDescription(book);
      if (text) {
        nextDrafts[book.id] = text;
        filled += 1;
      }
    } catch {
      // Bỏ qua tập lỗi lẻ để tiếp tục các tập còn lại
    }
  }
  onDraftsUpdated(nextDrafts);
  onNotify?.(
    filled > 0
      ? `Đã tự trích giới thiệu cho ${filled}/${candidates.length} tập EPUB.`
      : 'Các tệp EPUB này không nhúng sẵn thẻ tóm tắt tự động.',
    filled > 0 ? 'success' : 'info',
  );
}
