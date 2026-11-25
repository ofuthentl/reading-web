import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Eye, EyeOff, Image as ImageIcon, Loader2, Lock } from 'lucide-react';
import type { Book, Chapter, GuestBookIllustrationItem } from '@/types';
import { GuestWatermarkedThumb, OwnerLazyThumb } from '@/components/ReaderIllustrationThumbs';
import { fetchGuestBookIllustrations } from '@/lib/guestCrypto';
import { type ReaderThemePalette, isLazyMediaPlaceholderSrc } from '@/lib/readerConfig';

interface GalleryItem {
  key: string;
  chapterIndex: number;
  chapterNumber: number;
  chapterTitle: string;
  alt: string | null;
  domSrc?: string;
  zipPath?: string;
  mediaIndex?: number;
}

export interface ReaderIllustrationGalleryProps {
  book: Book;
  parsedChapters?: Chapter[];
  resolveOwnerMediaUrl?: (zipPath: string) => Promise<string | null>;
  activeIndex: number;
  maxUnlockedChapterIndex: number;
  watermarkLabel?: string;
  palette: ReaderThemePalette;
  onSelectChapter: (chapterIndex: number) => void;
  onOpenDomImage?: (src: string, alt: string) => void;
  onOpenGuestImage?: (bitmap: ImageBitmap, alt: string, ownedBitmap?: boolean) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onCloseDrawer: () => void;
}

export function ReaderIllustrationGallery({
  book,
  parsedChapters,
  resolveOwnerMediaUrl,
  activeIndex,
  maxUnlockedChapterIndex,
  watermarkLabel = 'Ofu Library',
  palette,
  onSelectChapter,
  onOpenDomImage,
  onOpenGuestImage,
  onApiError,
  onCloseDrawer,
}: ReaderIllustrationGalleryProps) {
  const isOwnerMode = Boolean(parsedChapters);
  const [hideSpoilers, setHideSpoilers] = useState(true);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(() => new Set());
  const [guestItems, setGuestItems] = useState<GuestBookIllustrationItem[] | null>(null);
  const [loadingGuest, setLoadingGuest] = useState(!isOwnerMode);

  useEffect(() => {
    if (isOwnerMode) return;
    const controller = new AbortController();
    setLoadingGuest(true);
    fetchGuestBookIllustrations(book.id, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setGuestItems(list);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setGuestItems([]);
        onApiError?.(err, 'Không thể tải danh sách minh hoạ.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingGuest(false);
      });
    return () => controller.abort();
  }, [book.id, isOwnerMode, onApiError]);

  const items = useMemo<GalleryItem[]>(() => {
    if (parsedChapters) {
      const out: GalleryItem[] = [];
      const seenKey = new Set<string>();
      for (let idx = 0; idx < parsedChapters.length; idx += 1) {
        const ch = parsedChapters[idx];
        if (!ch.content_html) continue;
        const doc = new DOMParser().parseFromString(ch.content_html, 'text/html');
        for (const img of Array.from(
          doc.querySelectorAll('img[src], img[data-zip-path], svg image[href], svg image[data-zip-path]'),
        )) {
          const rawSrc = img.getAttribute('src') || img.getAttribute('href') || '';
          const zipPath = img.getAttribute('data-zip-path') || undefined;
          const readyDomSrc =
            rawSrc && !isLazyMediaPlaceholderSrc(rawSrc) ? rawSrc : undefined;
          const dedupKey = zipPath || readyDomSrc;
          if (!dedupKey || seenKey.has(dedupKey)) continue;
          seenKey.add(dedupKey);
          const alt = img.getAttribute('alt')?.trim() || null;
          out.push({
            key: `dom_${idx}_${out.length}`,
            chapterIndex: idx,
            chapterNumber: ch.chapter_number || idx + 1,
            chapterTitle: ch.title,
            alt,
            ...(readyDomSrc ? { domSrc: readyDomSrc } : {}),
            ...(zipPath ? { zipPath } : {}),
          });
        }
      }
      return out;
    }

    return (guestItems || []).map((it) => ({
      key: `guest_${it.mediaIndex}`,
      chapterIndex: it.chapterIndex,
      chapterNumber: it.chapterNumber,
      chapterTitle: it.chapterTitle,
      alt: it.alt,
      mediaIndex: it.mediaIndex,
    }));
  }, [guestItems, parsedChapters]);

  const unlockedLimit = Math.max(activeIndex, maxUnlockedChapterIndex);
  const spoilerCount = useMemo(
    () => items.filter((it) => it.chapterIndex > unlockedLimit).length,
    [items, unlockedLimit],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`flex items-center justify-between gap-2 border-b px-3 py-2.5 ${palette.border}`}>
        <span className={`text-[11px] font-medium ${palette.textSecondary}`}>
          {loadingGuest ? 'Đang quét ảnh...' : `${items.length} minh hoạ trong tập`}
        </span>

        {spoilerCount > 0 && (
          <button
            type="button"
            onClick={() => setHideSpoilers((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
              hideSpoilers ? palette.active : `${palette.border} ${palette.hover}`
            }`}
          >
            {hideSpoilers ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            <span>Che chưa đọc ({spoilerCount})</span>
          </button>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {loadingGuest ? (
          <div className={`flex flex-col items-center justify-center gap-2 py-12 text-xs ${palette.textSecondary}`}>
            <Loader2 className="h-5 w-5 animate-spin opacity-70" />
            <span>Đang tải chỉ mục minh hoạ...</span>
          </div>
        ) : items.length === 0 ? (
          <div className={`flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-xs ${palette.textSecondary}`}>
            <ImageIcon className="h-6 w-6 opacity-50" />
            <p>Tập sách này không có trang minh hoạ đi kèm.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {items.map((item, idx) => {
              const isLockedSpoiler =
                hideSpoilers &&
                item.chapterIndex > unlockedLimit &&
                !revealedKeys.has(item.key);
              const altText = item.alt || `${book.title} — Minh hoạ #${idx + 1}`;

              return (
                <div
                  key={item.key}
                  className={`flex flex-col overflow-hidden rounded-xl border ${palette.border}`}
                >
                  {isLockedSpoiler ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedKeys((prev) => {
                          const next = new Set(prev);
                          next.add(item.key);
                          return next;
                        })
                      }
                      className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 px-2 text-center transition ${palette.hover}`}
                    >
                      <Lock className="h-4 w-4 text-amber-500" />
                      <span className="text-[11px] font-semibold">Chưa đọc tới</span>
                      <span className={`line-clamp-1 text-[10px] ${palette.textSecondary}`}>
                        Phần {item.chapterNumber}
                      </span>
                      <span className="mt-0.5 rounded-md border border-current/20 px-1.5 py-0.5 text-[10px] font-medium">
                        Bấm để hé mở
                      </span>
                    </button>
                  ) : item.domSrc ? (
                    <button
                      type="button"
                      onClick={() => onOpenDomImage?.(item.domSrc!, altText)}
                      className="group relative aspect-[3/4] w-full overflow-hidden bg-black/5"
                    >
                      <img
                        src={item.domSrc}
                        alt={altText}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    </button>
                  ) : item.zipPath && resolveOwnerMediaUrl ? (
                    <OwnerLazyThumb
                      zipPath={item.zipPath}
                      alt={altText}
                      palette={palette}
                      resolveMediaUrl={resolveOwnerMediaUrl}
                      onOpen={(src) => onOpenDomImage?.(src, altText)}
                    />
                  ) : item.mediaIndex !== undefined ? (
                    <GuestWatermarkedThumb
                      bookId={book.id}
                      mediaIndex={item.mediaIndex}
                      watermarkLabel={watermarkLabel}
                      alt={altText}
                      palette={palette}
                      onOpen={(bmp, owned) => onOpenGuestImage?.(bmp, altText, owned)}
                    />
                  ) : null}

                  <div className={`flex items-center justify-between gap-1 border-t px-2 py-1.5 ${palette.border}`}>
                    <span className={`min-w-0 truncate text-[10.5px] ${palette.textSecondary}`}>
                      #{idx + 1} · Phần {item.chapterNumber}
                    </span>
                    <button
                      type="button"
                      disabled={isLockedSpoiler}
                      onClick={() => {
                        onSelectChapter(item.chapterIndex);
                        onCloseDrawer();
                      }}
                      title={isLockedSpoiler ? 'Hé mở ảnh trước khi nhảy tới chương chưa đọc' : `Tới ${item.chapterTitle}`}
                      className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${palette.accentText} ${palette.hover}`}
                    >
                      <span>Tới</span>
                      <ArrowUpRight className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
