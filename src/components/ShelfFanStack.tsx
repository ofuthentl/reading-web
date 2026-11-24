import { useMemo, useState } from 'react';
import type { Book, ShelfGroup } from '@/types';
import { getBookSortTitle, pickClothCoverColor } from '@/lib/bookMetadata';
import { extractVolumeNumber } from '@/lib/shelfSummary';
import { useCoverUrl } from '@/hooks/useCoverUrl';

/**
 * Chọn tối đa 2 tập tiếp theo (ưu tiên Tập 2, Tập 3 có ảnh bìa thật) để xếp quạt phía sau bìa chính (`PA-A`).
 */
function pickShelfFanBooks(shelf: ShelfGroup, primaryCoverBook: Book | null): Book[] {
  if (shelf.books.length < 2) return [];
  const primaryId = primaryCoverBook?.id ?? null;

  const candidates = shelf.books
    .filter((b) => b.id !== primaryId)
    .map((book, idx) => {
      const vol = extractVolumeNumber(getBookSortTitle(book));
      return {
        book,
        idx,
        hasCover: Boolean(book.cover_key),
        vol: vol !== null && vol > 0 ? vol : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      if (a.hasCover !== b.hasCover) return a.hasCover ? -1 : 1;
      if (a.vol !== b.vol) return a.vol - b.vol;
      return a.idx - b.idx;
    });

  return candidates.slice(0, 2).map((c) => c.book);
}

function FanLayerCover({
  book,
  depth,
  enabled,
}: {
  book: Book;
  depth: 1 | 2;
  enabled: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const coverUrl = useCoverUrl(book.cover_key, enabled);
  const showImg = Boolean(coverUrl && !imgFailed);
  const clothColor = pickClothCoverColor(`${book.id}-${book.title}`);
  const volNum = extractVolumeNumber(getBookSortTitle(book));

  return (
    <div
      aria-hidden="true"
      className={depth === 1 ? 'shelf-fan-layer shelf-fan-1' : 'shelf-fan-layer shelf-fan-2'}
    >
      {showImg ? (
        <img
          src={coverUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          style={{ backgroundColor: clothColor }}
          className="relative flex h-full w-full items-start justify-end p-2 text-[#f6efe2]"
        >
          <span className="rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-bold">
            {volNum !== null ? `T.${volNum}` : `#${depth + 1}`}
          </span>
        </div>
      )}
    </div>
  );
}

export function ShelfFanStack({
  shelf,
  coverBook,
  isNearViewport,
}: {
  shelf: ShelfGroup;
  coverBook: Book | null;
  isNearViewport: boolean;
}) {
  const fanBooks = useMemo(() => pickShelfFanBooks(shelf, coverBook), [coverBook, shelf]);
  if (fanBooks.length === 0) return null;

  return (
    <>
      {fanBooks[1] && <FanLayerCover book={fanBooks[1]} depth={2} enabled={isNearViewport} />}
      {fanBooks[0] && <FanLayerCover book={fanBooks[0]} depth={1} enabled={isNearViewport} />}
    </>
  );
}
