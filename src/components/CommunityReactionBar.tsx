import { useState } from 'react';
import type { CommunityReactionEmoji } from '@/types';
import type { ReaderThemePalette } from '@/lib/readerConfig';

const REACTION_OPTIONS: ReadonlyArray<{
  id: CommunityReactionEmoji;
  glyph: string;
  label: string;
}> = [
  { id: 'fire', glyph: '🔥', label: 'Cháy' },
  { id: 'heart', glyph: '❤️', label: 'Yêu thích' },
  { id: 'laugh', glyph: '😂', label: 'Cười xỉu' },
  { id: 'cry', glyph: '😭', label: 'Cảm động' },
  { id: 'mindblown', glyph: '🤯', label: 'Bất ngờ' },
];

export interface CommunityReactionBarProps {
  reactions?: Partial<Record<CommunityReactionEmoji, number>>;
  myReactions?: readonly CommunityReactionEmoji[];
  isReader: boolean;
  palette?: ReaderThemePalette;
  borderClass: string;
  mutedTextClass: string;
  disabled?: boolean;
  onToggleReaction: (emoji: CommunityReactionEmoji) => void;
}

export function CommunityReactionBar({
  reactions,
  myReactions,
  isReader,
  palette,
  borderClass,
  mutedTextClass,
  disabled = false,
  onToggleReaction,
}: CommunityReactionBarProps) {
  const [popId, setPopId] = useState<CommunityReactionEmoji | null>(null);
  const mySet = new Set(myReactions ?? []);

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Biểu cảm bình luận">
      {REACTION_OPTIONS.map(({ id, glyph, label }) => {
        const count = Number(reactions?.[id] ?? 0);
        const active = mySet.has(id);
        const activeStyle =
          isReader && palette
            ? `${palette.accentSoftBg} ${palette.accentText} border-amber-500/45`
            : 'border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-300';
        const idleStyle = `${borderClass} ${mutedTextClass} ${
          count === 0 ? 'opacity-65 hover:opacity-100' : ''
        }`;

        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-label={`${label}${count > 0 ? ` (${count})` : ''}`}
            aria-pressed={active}
            title={label}
            onClick={() => {
              setPopId(id);
              onToggleReaction(id);
            }}
            onAnimationEnd={() => {
              if (popId === id) setPopId(null);
            }}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums transition hover:scale-105 disabled:opacity-45 ${
              active ? activeStyle : idleStyle
            } ${popId === id ? 'micro-pop' : ''}`}
          >
            <span aria-hidden="true" className="text-xs leading-none">
              {glyph}
            </span>
            {count > 0 && <span className="font-semibold">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
