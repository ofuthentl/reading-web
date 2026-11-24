import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { pickClothCoverColor } from '@/lib/bookMetadata';
import type { ShelfSummary } from '@/lib/shelfSummary';
import { useCoverUrl } from '@/hooks/useCoverUrl';

const BOOK_HEIGHT_STEPS = [164, 168, 170, 172, 174, 176, 178] as const;

function computeSpineHeight(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return BOOK_HEIGHT_STEPS[Math.abs(hash) % BOOK_HEIGHT_STEPS.length];
}

function lightenHex(hex: string, amount = 22): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = Math.min(255, Number.parseInt(clean.slice(0, 2), 16) + amount);
  const g = Math.min(255, Number.parseInt(clean.slice(2, 4), 16) + amount);
  const b = Math.min(255, Number.parseInt(clean.slice(4, 6), 16) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

export interface SpineBookshelfSlotProps {
  summary: ShelfSummary;
  spineWidth: number;
  isOpen: boolean;
  isRowVisible: boolean;
  registerButtonRef?: (shelfKey: string, node: HTMLButtonElement | null) => void;
  onHoverIntent: (shelfKey: string) => void;
  onActivatePreview: (shelfKey: string) => void;
  onOpenShelf: (shelfKey: string) => void;
  onStepNeighbor: (currentKey: string, delta: -1 | 1) => void;
}

export function SpineBookshelfSlot({
  summary,
  spineWidth,
  isOpen,
  isRowVisible,
  registerButtonRef,
  onHoverIntent,
  onActivatePreview,
  onOpenShelf,
  onStepNeighbor,
}: SpineBookshelfSlotProps) {
  const {
    shelf,
    coverBook,
    isFavorite,
    authorLabel,
    bookCount,
    readingStatus,
    progressPercent,
    isGuestLocked,
  } = summary;

  const lastPointerTypeRef = useRef<string>('mouse');
  const [imgFailed, setImgFailed] = useState(false);
  const coverKey = coverBook?.cover_key ?? null;

  useEffect(() => {
    setImgFailed(false);
  }, [coverKey]);

  const coverUrl = useCoverUrl(coverKey, isRowVisible || isOpen);
  const showImage = Boolean(coverUrl && !imgFailed);

  const spineW = spineWidth;
  const bookH = computeSpineHeight(shelf.key);
  const coverW = Math.round(bookH * 0.7);
  const baseColor = pickClothCoverColor(`${shelf.key}-${shelf.name}`);
  const highlightColor = lightenHex(baseColor, 24);

  const pctValue =
    progressPercent === null
      ? 0
      : readingStatus === 'completed'
        ? 100
        : Math.max(8, progressPercent);
  const progressBarColor =
    readingStatus === 'completed' ? '#6ee7b7' : '#fbbf24';

  const slotStyle = {
    ['--spine-w' as string]: `${spineW}px`,
    ['--cover-w' as string]: `${coverW}px`,
    ['--book-h' as string]: `${bookH}px`,
  } as CSSProperties;

  return (
    <button
      ref={(node) => registerButtonRef?.(shelf.key, node)}
      type="button"
      data-shelf-key={shelf.key}
      aria-label={`${shelf.name} (${bookCount} tập)`}
      aria-expanded={isOpen}
      title={`${shelf.name} (${bookCount} tập)`}
      style={slotStyle}
      onPointerDown={(event) => {
        lastPointerTypeRef.current = event.pointerType || 'mouse';
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') {
          onHoverIntent(shelf.key);
        }
      }}
      onFocus={() => {
        onActivatePreview(shelf.key);
      }}
      onClick={(event) => {
        // Bàn phím Enter / Space luôn có detail === 0 -> mở kệ ngay
        if (event.detail === 0) {
          onOpenShelf(shelf.key);
          return;
        }
        const ptr = lastPointerTypeRef.current;
        if (ptr === 'touch' || ptr === 'pen') {
          if (isOpen) {
            onOpenShelf(shelf.key);
          } else {
            onActivatePreview(shelf.key);
          }
          return;
        }
        onOpenShelf(shelf.key);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onStepNeighbor(shelf.key, -1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onStepNeighbor(shelf.key, 1);
        }
      }}
      className={`book-slot focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
        isOpen ? 'is-open' : ''
      }`}
    >
      <div className="book-rigid">
        {/* Mặt 1: Gáy sách bên PHẢI */}
        <div
          className="face-spine flex flex-col items-center justify-between px-1 py-2"
          style={{
            background: `linear-gradient(150deg, ${baseColor} 0%, ${highlightColor} 100%)`,
            color: '#f6efe2',
          }}
        >
          {isGuestLocked ? (
            <Lock className="h-2.5 w-2.5 shrink-0 text-rose-200/95" />
          ) : (
            <span className="font-mono text-[9px] font-bold leading-none opacity-85">
              {bookCount}
            </span>
          )}

          <span className="spine-title max-h-[112px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold leading-none">
            {isFavorite ? '★ ' : ''}
            {shelf.name}
          </span>

          <span className="h-[3px] w-4/5 overflow-hidden rounded-full bg-black/30">
            {pctValue > 0 && !isGuestLocked && (
              <span
                className="block h-full rounded-full"
                style={{ width: `${pctValue}%`, backgroundColor: progressBarColor }}
              />
            )}
          </span>
        </div>

        {/* Mặt 2: Bìa trước 7:10 gắn vuông góc -90deg ở hông TRÁI gáy -> xoay ra bên TRÁI */}
        <div className="face-front">
          {showImage ? (
            <img
              src={coverUrl!}
              alt={shelf.name}
              loading="lazy"
              decoding="async"
              onError={() => setImgFailed(true)}
              className="block h-full w-full object-cover"
            />
          ) : (
            <div
              style={{
                background: `linear-gradient(145deg, ${baseColor} 0%, ${highlightColor} 100%)`,
              }}
              className="flex h-full w-full flex-col justify-between p-2.5 text-left text-[#f6efe2]"
            >
              <div className="space-y-1">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-amber-200/90">
                  {bookCount} tập
                </span>
                <p className="line-clamp-4 font-display text-[11.5px] font-semibold leading-snug">
                  {shelf.name}
                </p>
              </div>
              <p className="truncate text-[9.5px] text-[#e6d5b8]/85">{authorLabel}</p>
            </div>
          )}

          {isGuestLocked && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-[#120b0e]/82 text-rose-100 shadow-md">
                <Lock className="h-3.5 w-3.5" />
              </span>
            </span>
          )}

          <div className="cover-light-veil" />
        </div>

        {/* Mặt 3: Cạnh ruột giấy bên mép trái */}
        <div className="face-pages" />
      </div>
    </button>
  );
}
