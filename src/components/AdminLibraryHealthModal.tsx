import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  FileWarning,
  FolderEdit,
  GitMerge,
  HeartPulse,
  ImageOff,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Tag,
  Wand2,
  X,
} from 'lucide-react';
import type { Book } from '@/types';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { getBookSortTitle } from '@/lib/bookMetadata';
import { auditLibraryHealth } from '@/lib/libraryHealthAudit';
import { toShelfPrefKey } from '@/lib/shelfPrefs';

type HealthFilterTab = 'all' | 'pack' | 'cover' | 'meta' | 'tags' | 'dup';
type PaginatedSectionKey = 'pack' | 'dup' | 'cover' | 'tags' | 'meta';

const SECTION_PAGE_SIZE = 25;

export interface AdminLibraryHealthModalProps {
  open: boolean;
  books: readonly Book[];
  shelfTags?: Readonly<Record<string, string[]>>;
  onClose: () => void;
  onEditBook: (book: Book) => void;
  onOpenShelfMetadata: (shelfKey: string, openAniList?: boolean) => void;
  onRenameShelf: (shelfName: string) => void;
  onOpenProtection: (options?: { initialShelfKey?: string; initialBookId?: string }) => void;
  onJumpToShelf: (shelfKey: string) => void;
}

function PaginationBar({
  shown,
  total,
  onMore,
  onAll,
}: {
  shown: number;
  total: number;
  onMore: () => void;
  onAll: () => void;
}) {
  if (shown >= total) return null;
  const remaining = total - shown;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
      <span className="text-ink-muted tabular-nums">
        Đang hiện {shown} / {total} mục
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onMore}
          className="rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-line-strong hover:bg-subtle"
        >
          Xem thêm (+{Math.min(SECTION_PAGE_SIZE, remaining)})
        </button>
        {remaining > SECTION_PAGE_SIZE && (
          <button
            type="button"
            onClick={onAll}
            className="rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink-muted transition hover:text-ink"
          >
            Hiện tất cả ({total})
          </button>
        )}
      </div>
    </div>
  );
}

export function AdminLibraryHealthModal({
  open,
  books,
  shelfTags,
  onClose,
  onEditBook,
  onOpenShelfMetadata,
  onRenameShelf,
  onOpenProtection,
  onJumpToShelf,
}: AdminLibraryHealthModalProps) {
  const [tab, setTab] = useState<HealthFilterTab>('all');
  const [limits, setLimits] = useState<Record<PaginatedSectionKey, number>>({
    pack: SECTION_PAGE_SIZE,
    dup: SECTION_PAGE_SIZE,
    cover: SECTION_PAGE_SIZE,
    tags: SECTION_PAGE_SIZE,
    meta: SECTION_PAGE_SIZE,
  });
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setLimits({
      pack: SECTION_PAGE_SIZE,
      dup: SECTION_PAGE_SIZE,
      cover: SECTION_PAGE_SIZE,
      tags: SECTION_PAGE_SIZE,
      meta: SECTION_PAGE_SIZE,
    });
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  const report = useMemo(
    () => (open ? auditLibraryHealth(books, shelfTags) : null),
    [books, open, shelfTags],
  );

  if (!open || !report || typeof document === 'undefined') return null;

  const showMore = (key: PaginatedSectionKey) =>
    setLimits((prev) => ({ ...prev, [key]: prev[key] + SECTION_PAGE_SIZE }));
  const showAll = (key: PaginatedSectionKey, total: number) =>
    setLimits((prev) => ({ ...prev, [key]: total }));

  const tabs: Array<{ id: HealthFilterTab; label: string; count: number }> = [
    { id: 'all', label: 'Tất cả', count: report.totalIssues },
    { id: 'pack', label: 'Gói khách', count: report.missingGuestPack.length },
    { id: 'cover', label: 'Thiếu bìa', count: report.missingCover.length },
    { id: 'meta', label: 'Thiếu thông tin', count: report.incompleteMetadata.length },
    { id: 'tags', label: 'Thiếu thể loại', count: report.untaggedShelves.length },
    { id: 'dup', label: 'Kệ nghi trùng', count: report.duplicateShelfPairs.length },
  ];

  const showPack = (tab === 'all' || tab === 'pack') && report.missingGuestPack.length > 0;
  const showCover = (tab === 'all' || tab === 'cover') && report.missingCover.length > 0;
  const showMeta = (tab === 'all' || tab === 'meta') && report.incompleteMetadata.length > 0;
  const showTags = (tab === 'all' || tab === 'tags') && report.untaggedShelves.length > 0;
  const showDup = (tab === 'all' || tab === 'dup') && report.duplicateShelfPairs.length > 0;
  const hasVisible = showPack || showCover || showMeta || showTags || showDup;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-health-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="moonlit-card fade-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-crimson-accent">
              <HeartPulse className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="library-health-modal-title"
                  className="font-display text-lg font-semibold text-ink"
                >
                  Kiểm tra sức khoẻ kho sách
                </h2>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${
                    report.healthScore >= 90
                      ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                      : report.healthScore >= 70
                        ? 'border-amber-500/40 bg-amber-500/12 text-amber-700 dark:text-amber-300'
                        : 'border-rose-500/40 bg-rose-500/12 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {report.healthScore}%
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                Hiển thị đầy đủ toàn bộ {report.totalIssues} mục cần bổ sung · mở thẳng sửa metadata
                hoặc AniList
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng kiểm tra sức khoẻ kho sách"
            className="rounded-lg p-1.5 text-ink-muted transition hover:bg-subtle hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-line bg-canvas/60 px-5 py-2.5">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                tab === item.id
                  ? 'border-accent bg-accent/12 font-semibold text-accent'
                  : 'border-line bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              <span>{item.label}</span>
              <span className="rounded-full bg-subtle px-1.5 py-0.5 text-[10px] tabular-nums">
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {!hasVisible ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-display text-base font-semibold text-ink">
                Kho sách đang rất gọn gàng!
              </p>
              <p className="text-xs text-ink-muted">
                Không phát hiện mục thiếu sót nào trong nhóm này.
              </p>
            </div>
          ) : (
            <>
              {showPack && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Chưa đồng bộ gói bảo mật khách ({report.missingGuestPack.length})</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenProtection();
                      }}
                      className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover"
                    >
                      Mở đồng bộ hàng loạt
                    </button>
                  </div>
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas text-xs">
                    {report.missingGuestPack.slice(0, limits.pack).map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-2 px-3.5 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{getBookSortTitle(b)}</p>
                          <p className="truncate text-[11px] text-ink-muted">
                            {b.shelf || 'Kho chưa phân loại'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenProtection({ initialBookId: b.id });
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-line-strong hover:bg-subtle"
                        >
                          <RefreshCw className="h-3 w-3 text-accent" />
                          <span>Đồng bộ</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <PaginationBar
                    shown={Math.min(limits.pack, report.missingGuestPack.length)}
                    total={report.missingGuestPack.length}
                    onMore={() => showMore('pack')}
                    onAll={() => showAll('pack', report.missingGuestPack.length)}
                  />
                </section>
              )}

              {showDup && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-crimson-accent">
                    <GitMerge className="h-3.5 w-3.5" />
                    <span>Kệ sách nghi trùng lặp ({report.duplicateShelfPairs.length})</span>
                  </h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas text-xs">
                    {report.duplicateShelfPairs.slice(0, limits.dup).map((pair, idx) => (
                      <li
                        key={`${pair.shelfA.key}-${pair.shelfB.key}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-ink">
                            “{pair.shelfA.name}” ↔ “{pair.shelfB.name}”
                          </p>
                          <p className="text-[11px] text-ink-muted">{pair.reason}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onRenameShelf(pair.shelfB.name);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-line-strong hover:bg-subtle"
                        >
                          <FolderEdit className="h-3 w-3" />
                          <span>Đổi tên / Gộp</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <PaginationBar
                    shown={Math.min(limits.dup, report.duplicateShelfPairs.length)}
                    total={report.duplicateShelfPairs.length}
                    onMore={() => showMore('dup')}
                    onAll={() => showAll('dup', report.duplicateShelfPairs.length)}
                  />
                </section>
              )}

              {showCover && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    <ImageOff className="h-3.5 w-3.5 text-accent" />
                    <span>Tập sách thiếu ảnh bìa ({report.missingCover.length})</span>
                  </h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas text-xs">
                    {report.missingCover.slice(0, limits.cover).map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-2 px-3.5 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{getBookSortTitle(b)}</p>
                          <p className="truncate text-[11px] text-ink-muted">
                            {b.shelf || 'Kho chưa phân loại'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onEditBook(b);
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-line-strong hover:bg-subtle"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Cập nhật bìa</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <PaginationBar
                    shown={Math.min(limits.cover, report.missingCover.length)}
                    total={report.missingCover.length}
                    onMore={() => showMore('cover')}
                    onAll={() => showAll('cover', report.missingCover.length)}
                  />
                </section>
              )}

              {showTags && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    <Tag className="h-3.5 w-3.5 text-accent" />
                    <span>Bộ truyện chưa gắn thể loại ({report.untaggedShelves.length})</span>
                  </h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas text-xs">
                    {report.untaggedShelves.slice(0, limits.tags).map((s) => (
                      <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
                        <span className="truncate font-medium text-ink">
                          {s.name}{' '}
                          <span className="font-normal text-ink-muted">({s.books.length} tập)</span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenShelfMetadata(s.key, true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-crimson-accent/40 bg-surface px-2.5 py-1 font-medium text-crimson-accent transition hover:bg-crimson-accent/10"
                          >
                            <Wand2 className="h-3 w-3" />
                            <span>AniList</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onJumpToShelf(s.key);
                            }}
                            className="rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-accent transition hover:border-line-strong hover:bg-subtle"
                          >
                            Mở kệ
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <PaginationBar
                    shown={Math.min(limits.tags, report.untaggedShelves.length)}
                    total={report.untaggedShelves.length}
                    onMore={() => showMore('tags')}
                    onAll={() => showAll('tags', report.untaggedShelves.length)}
                  />
                </section>
              )}

              {showMeta && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    <FileWarning className="h-3.5 w-3.5 text-accent" />
                    <span>Thiếu tác giả hoặc giới thiệu ({report.incompleteMetadata.length})</span>
                  </h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas text-xs">
                    {report.incompleteMetadata
                      .slice(0, limits.meta)
                      .map(({ book: b, missingAuthor, missingDescription }) => (
                        <li
                          key={b.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{getBookSortTitle(b)}</p>
                            <p className="truncate text-[11px] text-ink-muted">
                              {[
                                missingAuthor ? 'Thiếu tác giả' : null,
                                missingDescription ? 'Thiếu mô tả' : null,
                                b.shelf || 'Kho chưa phân loại',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenShelfMetadata(toShelfPrefKey(b.shelf), true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-crimson-accent/40 bg-surface px-2.5 py-1 font-medium text-crimson-accent transition hover:bg-crimson-accent/10"
                            >
                              <Wand2 className="h-3 w-3" />
                              <span>AniList bộ</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onEditBook(b);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-line-strong hover:bg-subtle"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Sửa tập</span>
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                  <PaginationBar
                    shown={Math.min(limits.meta, report.incompleteMetadata.length)}
                    total={report.incompleteMetadata.length}
                    onMore={() => showMore('meta')}
                    onAll={() => showAll('meta', report.incompleteMetadata.length)}
                  />
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
