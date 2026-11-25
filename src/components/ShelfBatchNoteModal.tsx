import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Languages, Loader2, Save, Sparkles, UserPen, Wand2, X } from 'lucide-react';
import type { AniListNovelCandidate, Book, ShelfGroup } from '@/types';
import { AniListSuggestPanel } from '@/components/AniListSuggestPanel';
import {
  type ShelfBatchMode,
  ShelfBatchNoteFields,
} from '@/components/ShelfBatchNoteFields';
import { setShelfAltTitles } from '@/lib/catalogApi';
import {
  type BatchMetadataJob,
  applyAndSaveFullAniListCandidate,
  buildAuthorSyncJobs,
  computeShelfAuthorAnalysis,
  executeBatchMetadataJobs,
  runShelfEpubAutoExtract,
} from '@/lib/shelfBatchHelpers';
import { normalizeClientAltTitles } from '@/lib/shelfPrefs';
import {
  UNKNOWN_AUTHOR_LABEL,
  getEffectiveAuthorInShelf,
  getHealedTitleInShelf,
} from '@/lib/shelfSummary';
import type { ToastType } from '@/hooks/useToast';

export interface ShelfBatchNoteModalProps {
  shelf: ShelfGroup | null;
  currentAltTitles?: readonly string[];
  currentTags?: readonly string[];
  onClose: () => void;
  onBooksUpdated: (books: Book[]) => void;
  onAltTitlesSaved?: (shelfName: string, altTitles: string[]) => void;
  onTagsSaved?: (shelfName: string, tags: string[]) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function ShelfBatchNoteModal({
  shelf,
  currentAltTitles = [],
  currentTags = [],
  onClose,
  onBooksUpdated,
  onAltTitlesSaved,
  onTagsSaved,
  onApiError,
  onNotify,
}: ShelfBatchNoteModalProps) {
  const [mode, setMode] = useState<ShelfBatchMode>('shared');
  const [sharedText, setSharedText] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [showAllVolumes, setShowAllVolumes] = useState(false);
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [authorInput, setAuthorInput] = useState('');
  const [onlyMissingAuthor, setOnlyMissingAuthor] = useState(false);
  const [altTitlesDraft, setAltTitlesDraft] = useState<string[]>([]);
  const [anilistOpen, setAnilistOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveDoneCount, setSaveDoneCount] = useState(0);
  const [saveTotalCount, setSaveTotalCount] = useState(0);
  const [extracting, setExtracting] = useState(false);

  const mountedRef = useRef(true);
  const shelfRef = useRef(shelf);
  shelfRef.current = shelf;
  const altRef = useRef(currentAltTitles);
  altRef.current = currentAltTitles;
  const rawAuthorCountsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const missingBooks = useMemo(
    () => (shelf ? shelf.books.filter((b) => !b.description?.trim()) : []),
    [shelf],
  );

  const { rawAuthorCounts, missingAuthorBooks, knownAuthorsInShelf } = useMemo(
    () => computeShelfAuthorAnalysis(shelf),
    [shelf],
  );

  rawAuthorCountsRef.current = rawAuthorCounts;
  const shelfKey = shelf?.key ?? null;

  useEffect(() => {
    const activeShelf = shelfRef.current;
    if (!shelfKey || !activeShelf) return;
    const firstExisting =
      activeShelf.books.find((b) => b.description?.trim())?.description?.trim() ?? '';
    const allHaveDesc = activeShelf.books.every((b) => Boolean(b.description?.trim()));
    setSharedText(firstExisting);
    setOverwriteExisting(allHaveDesc);
    setShowAllVolumes(allHaveDesc);

    const initialDrafts: Record<string, string> = {};
    for (const b of activeShelf.books) initialDrafts[b.id] = b.description?.trim() ?? '';
    setDraftById(initialDrafts);

    const firstKnownAuthor =
      activeShelf.books
        .map((b) => getEffectiveAuthorInShelf(b, activeShelf, rawAuthorCountsRef.current))
        .find((a) => a !== UNKNOWN_AUTHOR_LABEL) ?? '';
    setAuthorInput(firstKnownAuthor);
    setOnlyMissingAuthor(false);
    setAltTitlesDraft(normalizeClientAltTitles(altRef.current));
    setAnilistOpen(false);
    setMode('shared');
    setSaving(false);
    setExtracting(false);
  }, [shelfKey]);

  useEffect(() => {
    if (!shelf) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !extracting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [extracting, onClose, saving, shelf]);

  if (!shelf) return null;

  const targetSharedBooks = overwriteExisting ? shelf.books : missingBooks;
  const targetAuthorBooks = onlyMissingAuthor ? missingAuthorBooks : shelf.books;
  const listedVolumes = showAllVolumes ? shelf.books : missingBooks;
  const hasEpubCandidates = shelf.books.some((b) => b.file_type === 'epub');

  const handleAutoExtract = async () => {
    if (extracting || saving) return;
    setExtracting(true);
    try {
      await runShelfEpubAutoExtract({
        mode,
        shelf,
        listedVolumes,
        draftById,
        onAuthorExtracted: setAuthorInput,
        onSharedExtracted: setSharedText,
        onDraftsUpdated: setDraftById,
        onNotify,
      });
    } catch {
      onNotify?.('Không thể đọc tệp EPUB để trích xuất.', 'warning');
    } finally {
      if (mountedRef.current) setExtracting(false);
    }
  };

  const runBatchPatch = async (jobs: BatchMetadataJob[], successMessage: string) => {
    if (jobs.length === 0) {
      onNotify?.('Tất cả các tập mục tiêu đã khớp sẵn thông tin này.', 'info');
      return;
    }
    setSaving(true);
    setSaveDoneCount(0);
    setSaveTotalCount(jobs.length);
    const { updatedBooks, firstError } = await executeBatchMetadataJobs(
      jobs,
      () => mountedRef.current,
      setSaveDoneCount,
    );
    if (!mountedRef.current) return;
    setSaving(false);
    if (updatedBooks.length > 0) onBooksUpdated(updatedBooks);
    if (firstError) {
      onApiError?.(firstError, 'Một số tập chưa lưu được thay đổi.');
      if (updatedBooks.length > 0) {
        onNotify?.(`Đã lưu ${updatedBooks.length}/${jobs.length} tập trước khi gặp lỗi.`, 'warning');
      }
      return;
    }
    onNotify?.(successMessage.replace('{count}', String(updatedBooks.length)), 'success');
    onClose();
  };

  const handleApplyAniListToForm = (candidate: AniListNovelCandidate) => {
    if (candidate.description) {
      setSharedText(candidate.description);
      if (missingBooks.length === 0) setOverwriteExisting(true);
    }
    if (candidate.author) setAuthorInput(candidate.author);
    if (candidate.altTitles.length > 0) {
      setAltTitlesDraft((prev) => normalizeClientAltTitles([...prev, ...candidate.altTitles]));
    }
    setAnilistOpen(false);
    onNotify?.(
      `Đã điền gợi ý AniList ("${candidate.primaryTitle}") vào biểu mẫu — hãy kiểm tra các tab và lưu.`,
      'info',
    );
  };

  const handleQuickSaveAllFromAniList = async (candidate: AniListNovelCandidate) => {
    if (saving || extracting) return;
    setSaving(true);
    setSaveDoneCount(0);
    setSaveTotalCount(0);
    try {
      const savedAlt = await applyAndSaveFullAniListCandidate({
        shelf,
        candidate,
        currentAltTitles: altTitlesDraft,
        currentTags,
        overwriteExistingDesc: overwriteExisting,
        rawAuthorCounts,
        isMounted: () => mountedRef.current,
        onTotalJobs: setSaveTotalCount,
        onProgress: setSaveDoneCount,
        onAltTitlesSaved,
        onTagsSaved,
        onBooksUpdated,
      });
      if (!mountedRef.current) return;
      setAltTitlesDraft(savedAlt);
      onNotify?.(
        `Đã đồng bộ trọn bộ thông tin AniList cho "${shelf.name}" (tác giả, tên khác, mô tả & thể loại).`,
        'success',
      );
      onClose();
    } catch (err) {
      if (mountedRef.current) onApiError?.(err, 'Không thể lưu trọn bộ dữ liệu từ AniList.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || extracting) return;

    if (mode === 'alt-titles') {
      setSaving(true);
      setSaveTotalCount(0);
      try {
        const saved = await setShelfAltTitles(shelf.name, altTitlesDraft);
        onAltTitlesSaved?.(shelf.name, saved);
        onNotify?.(
          saved.length > 0
            ? `Đã lưu ${saved.length} tên gọi khác cho "${shelf.name}".`
            : `Đã xoá tên gọi khác của "${shelf.name}".`,
          'success',
        );
        onClose();
      } catch (err) {
        onApiError?.(err, 'Không thể lưu tên gọi khác.');
      } finally {
        if (mountedRef.current) setSaving(false);
      }
      return;
    }

    if (mode === 'author') {
      const nextAuthor = authorInput.trim() || UNKNOWN_AUTHOR_LABEL;
      const jobs = buildAuthorSyncJobs(targetAuthorBooks, shelf, rawAuthorCounts, nextAuthor);
      void runBatchPatch(
        jobs,
        `Đã đồng bộ tác giả "${nextAuthor}" cho {count} tập trong "${shelf.name}".`,
      );
      return;
    }

    if (mode === 'shared') {
      const trimmed = sharedText.trim();
      if (!trimmed) {
        onNotify?.('Vui lòng nhập nội dung ghi chú / giới thiệu trước khi lưu.', 'warning');
        return;
      }
      const jobs: BatchMetadataJob[] = targetSharedBooks
        .filter((b) => (b.description?.trim() ?? '') !== trimmed)
        .map((book) => ({ book, patch: { description: trimmed } }));
      void runBatchPatch(jobs, `Đã cập nhật ghi chú cho {count} tập trong "${shelf.name}".`);
      return;
    }

    const jobs: BatchMetadataJob[] = [];
    for (const book of listedVolumes) {
      const nextVal = (draftById[book.id] ?? '').trim();
      const prevVal = book.description?.trim() ?? '';
      if (nextVal !== prevVal) jobs.push({ book, patch: { description: nextVal || null } });
    }
    void runBatchPatch(jobs, `Đã lưu ghi chú cho {count} tập trong "${shelf.name}".`);
  };

  let healedTitleSample: { oldTitle: string; newTitle: string } | null = null;
  for (const book of targetAuthorBooks) {
    const healed = getHealedTitleInShelf(book, shelf, rawAuthorCounts);
    if (healed !== book.title) {
      healedTitleSample = { oldTitle: book.title, newTitle: healed };
      break;
    }
  }

  const submitLabel =
    mode === 'alt-titles'
      ? `Lưu tên khác (${altTitlesDraft.length})`
      : mode === 'author'
        ? `Đồng bộ cho ${targetAuthorBooks.length} tập`
        : mode === 'shared'
          ? `Lưu cho ${targetSharedBooks.length} tập`
          : 'Lưu các tập đã nhập';

  const submitDisabled =
    saving ||
    extracting ||
    (mode === 'shared' && (!sharedText.trim() || targetSharedBooks.length === 0)) ||
    (mode === 'author' && (!authorInput.trim() || targetAuthorBooks.length === 0));

  const HeaderIcon = mode === 'author' ? UserPen : mode === 'alt-titles' ? Languages : FileText;

  return createPortal(
    <div
      className="fixed inset-0 z-50 !m-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shelf-batch-note-title"
      onClick={() => {
        if (!saving && !extracting) onClose();
      }}
    >
      <div
        className="moonlit-card fade-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <HeaderIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="shelf-batch-note-title"
                className="truncate font-display text-lg font-semibold text-ink"
              >
                Thông tin bộ truyện &amp; Gợi ý AniList
              </h2>
              <p title={shelf.name} className="mt-0.5 truncate text-xs font-medium text-ink-muted">
                {shelf.name}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-muted">
                <span>
                  Trống ghi chú: <strong className="text-ink">{missingBooks.length}</strong>/
                  {shelf.books.length}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Tên khác: <strong className="text-ink">{altTitlesDraft.length}</strong>
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving || extracting}
            aria-label="Đóng cửa sổ"
            className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/50 px-5 py-2.5">
          <div className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-1 text-xs">
            {(
              [
                ['shared', 'Ghi chú chung'],
                ['per-volume', `Từng tập (${missingBooks.length})`],
                ['author', 'Tác giả'],
                ['alt-titles', `Tên khác (${altTitlesDraft.length})`],
              ] as const
            ).map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                disabled={saving || extracting}
                onClick={() => setMode(tabId)}
                className={`rounded-lg px-2.5 py-1.5 font-medium transition-colors ${
                  mode === tabId
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={saving || extracting}
              onClick={() => setAnilistOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                anilistOpen
                  ? 'border-crimson-accent bg-crimson-accent/12 text-crimson-accent'
                  : 'border-crimson-accent/40 bg-surface text-crimson-accent hover:bg-crimson-accent/10'
              }`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Gợi ý từ AniList</span>
            </button>

            {hasEpubCandidates && mode !== 'alt-titles' && (
              <button
                type="button"
                disabled={saving || extracting}
                onClick={() => void handleAutoExtract()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-50"
              >
                {extracting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                )}
                <span>{extracting ? 'Đang đọc...' : 'Tự trích EPUB'}</span>
              </button>
            )}
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 scrollbar-thin">
            {anilistOpen && (
              <AniListSuggestPanel
                initialQuery={altTitlesDraft[0] || shelf.name}
                mode="full"
                disabled={saving || extracting}
                onApplyCandidate={handleApplyAniListToForm}
                onQuickSaveAll={(cand) => void handleQuickSaveAllFromAniList(cand)}
                onClose={() => setAnilistOpen(false)}
                onApiError={onApiError}
                onNotify={onNotify}
              />
            )}

            <ShelfBatchNoteFields
              mode={mode}
              shelfName={shelf.name}
              totalBooksCount={shelf.books.length}
              missingBooksCount={missingBooks.length}
              missingAuthorCount={missingAuthorBooks.length}
              targetAuthorCount={targetAuthorBooks.length}
              knownAuthorsInShelf={knownAuthorsInShelf}
              healedTitlePreview={healedTitleSample}
              listedVolumes={listedVolumes}
              sharedText={sharedText}
              overwriteExisting={overwriteExisting}
              showAllVolumes={showAllVolumes}
              draftById={draftById}
              authorInput={authorInput}
              onlyMissingAuthor={onlyMissingAuthor}
              altTitlesDraft={altTitlesDraft}
              disabled={saving || extracting}
              onChangeSharedText={setSharedText}
              onChangeOverwriteExisting={setOverwriteExisting}
              onChangeShowAllVolumes={setShowAllVolumes}
              onChangeVolumeDraft={(bookId, value) =>
                setDraftById((prev) => ({ ...prev, [bookId]: value }))
              }
              onChangeAuthorInput={setAuthorInput}
              onChangeOnlyMissingAuthor={setOnlyMissingAuthor}
              onChangeAltTitlesDraft={setAltTitlesDraft}
            />

            {saving && saveTotalCount > 0 && (
              <div className="space-y-1.5 rounded-xl border border-line bg-canvas px-3.5 py-2.5">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>Đang lưu đồng bộ lên thư viện...</span>
                  <span className="font-medium tabular-nums text-ink">
                    {saveDoneCount} / {saveTotalCount} tập
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                  <div
                    className="h-full rounded-full bg-crimson-accent transition-all duration-200"
                    style={{ width: `${Math.round((saveDoneCount / saveTotalCount) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || extracting}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-45"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover disabled:opacity-45"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>{submitLabel}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
