import { type MouseEvent, useState } from 'react';
import { Star } from 'lucide-react';

const STAR_INDICES = [1, 2, 3, 4, 5] as const;

export interface HalfStarRatingControlProps {
  value: number | null;
  disabled?: boolean;
  mutedTextClass?: string;
  onChange: (nextRating: number) => void;
}

function resolveStarHalfFromPointer(
  star: number,
  clientX: number,
  target: HTMLElement,
): number {
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0) return star;
  const ratio = (clientX - rect.left) / rect.width;
  return ratio < 0.5 ? star - 0.5 : star;
}

function formatStarScore(score: number): string {
  return Number.isInteger(score) ? `${score}.0` : score.toFixed(1);
}

export function HalfStarRatingControl({
  value,
  disabled = false,
  mutedTextClass = 'text-ink-muted',
  onChange,
}: HalfStarRatingControlProps) {
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [popStar, setPopStar] = useState<number | null>(null);

  const activeScore = hoverScore ?? value ?? 0;

  const triggerScore = (score: number, starIdx: number) => {
    const clamped = Math.max(0.5, Math.min(5, Math.round(score * 2) / 2));
    setHoverScore(null);
    setPopStar(starIdx);
    onChange(clamped);
  };

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Chấm điểm từ 0.5 đến 5 sao (dùng phím mũi tên trái/phải để chỉnh nửa sao)"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value ?? 0}
      aria-valuetext={value ? `${value} trên 5 sao` : 'Chưa chấm sao'}
      onMouseLeave={() => setHoverScore(null)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          const next = Math.min(5, Math.round(((value ?? 0) + 0.5) * 2) / 2);
          triggerScore(next, Math.ceil(next));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          const current = value ?? 1;
          if (current <= 0.5 && value !== null) {
            onChange(value);
            return;
          }
          const next = Math.max(0.5, Math.round((current - 0.5) * 2) / 2);
          triggerScore(next, Math.ceil(next));
        } else if (e.key === 'Home') {
          e.preventDefault();
          triggerScore(0.5, 1);
        } else if (e.key === 'End') {
          e.preventDefault();
          triggerScore(5, 5);
        } else if ((e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') && value !== null) {
          e.preventDefault();
          onChange(value);
        }
      }}
      className="inline-flex items-center gap-0.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
    >
      {STAR_INDICES.map((star) => {
        const isFull = activeScore >= star;
        const isHalf = !isFull && activeScore >= star - 0.5;

        const handlePointerMove = (e: MouseEvent<HTMLButtonElement>) => {
          if (disabled) return;
          setHoverScore(resolveStarHalfFromPointer(star, e.clientX, e.currentTarget));
        };

        const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
          if (disabled) return;
          const chosen =
            e.detail === 0
              ? star
              : resolveStarHalfFromPointer(star, e.clientX, e.currentTarget);
          triggerScore(chosen, star);
        };

        return (
          <button
            key={star}
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={`Chấm ${star - 0.5} hoặc ${star} sao`}
            onMouseMove={handlePointerMove}
            onClick={handleClick}
            onAnimationEnd={() => {
              if (popStar === star) setPopStar(null);
            }}
            className={`relative rounded-md p-1 transition-transform hover:scale-110 disabled:opacity-50 ${
              popStar === star ? 'micro-pop' : ''
            }`}
          >
            <Star
              fill={isFull ? 'currentColor' : 'none'}
              className={`h-4 w-4 ${
                isFull
                  ? 'fill-amber-400 text-amber-400'
                  : isHalf
                    ? 'text-amber-400/75'
                    : `${mutedTextClass} opacity-55 hover:opacity-100`
              }`}
            />
            {isHalf && (
              <Star
                aria-hidden="true"
                fill="currentColor"
                style={{ clipPath: 'inset(0 50% 0 0)' }}
                className="pointer-events-none absolute left-1 top-1 h-4 w-4 fill-amber-400 text-amber-400"
              />
            )}
          </button>
        );
      })}

      {(hoverScore !== null || value !== null) && (
        <span className="ml-1 min-w-[2.1rem] text-[11px] font-semibold tabular-nums text-amber-500">
          {formatStarScore(hoverScore ?? value ?? 0)}★
        </span>
      )}
    </div>
  );
}
