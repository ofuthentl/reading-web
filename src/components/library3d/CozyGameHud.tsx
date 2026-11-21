import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Lock,
  Map as MapIcon,
  Moon,
  MoonStar,
  ShieldAlert,
  Sparkles,
  Sun,
  Unlock,
} from 'lucide-react';
import type { Book, ReadingProgress } from '@/types';
import { THEME_LABELS, type AppTheme } from '@/hooks/useTheme';
import { computeReaderRpgStats } from './bossRoomLayout3d';
import { MinimapWidget } from './MinimapWidget';
import type {
  BossRoomUnlockStatus,
  FloorWorldLayout3D,
  WorldTelemetryRefs,
} from './worldTypes';

export interface CozyGameHudProps {
  books: Book[];
  progress: Record<string, ReadingProgress>;
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  inBossRoom: boolean;
  bossUnlock: BossRoomUnlockStatus;
  telemetryRefs: WorldTelemetryRefs;
  paused: boolean;
  prefersReducedMotion: boolean;
  redrawSignal?: string;
  onCycleTheme: (origin?: { x: number; y: number }) => void;
}

function ThemeTimeIcon({ theme }: { theme: AppTheme }) {
  if (theme === 'light') return <Sun className="h-3 w-3 text-amber-500" />;
  if (theme === 'dim') return <Moon className="h-3 w-3 text-sky-400" />;
  return <MoonStar className="h-3 w-3 text-indigo-300" />;
}

/**
 * Compact top-left Cozy RPG HUD (`<= z-20`, surrounding gaps strictly `pointer-events-none`):
 * pairs the auto-scaling circular `MinimapWidget` with baseline `LV / XP / HP / Mana` gauges
 * derived from cumulative reading progress and a collapsible Floor Boss unlock goal card.
 */
export function CozyGameHud({
  books,
  progress,
  floor,
  theme,
  inBossRoom,
  bossUnlock,
  telemetryRefs,
  paused,
  prefersReducedMotion,
  redrawSignal,
  onCycleTheme,
}: CozyGameHudProps) {
  const [questOpen, setQuestOpen] = useState(true);
  const [mapVisible, setMapVisible] = useState(true);

  const rpgStats = useMemo(() => computeReaderRpgStats(books, progress), [books, progress]);

  const bossBookRatio = Math.min(1, bossUnlock.completedBooks / Math.max(1, bossUnlock.requiredBooks));
  const bossPageRatio = Math.min(1, bossUnlock.readPages / Math.max(1, bossUnlock.requiredPages));
  const bossProgressPct = bossUnlock.unlocked
    ? 100
    : Math.round(Math.max(bossBookRatio, bossPageRatio) * 100);
  const manaPct = Math.min(100, Math.round((rpgStats.mana / Math.max(1, rpgStats.maxMana)) * 100));

  return (
    <div className="pointer-events-none flex items-start gap-2.5">
      {mapVisible && (
        <MinimapWidget
          floor={floor}
          theme={theme}
          bossDoorUnlocked={bossUnlock.unlocked}
          telemetryRefs={telemetryRefs}
          paused={paused}
          prefersReducedMotion={prefersReducedMotion}
          redrawSignal={redrawSignal}
        />
      )}

      <section
        aria-label="Trạng thái độc giả & mục tiêu Phòng Boss"
        className="pointer-events-auto w-[224px] rounded-2xl border border-line-strong/80 bg-surface/92 px-3 py-2.5 shadow-lg backdrop-blur-md xl:w-[238px]"
      >
        {/* Top row: Level badge + Time-of-day quick pill + Minimap toggle */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <span
              title={`Tổng ${rpgStats.totalXp} XP · ${rpgStats.completedBooks} tập xong · ${rpgStats.readPages} trang đã đọc`}
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-0.5 font-mono text-[11px] font-bold text-accent-foreground shadow-sm"
            >
              <Sparkles className="h-3 w-3" />
              LV.{rpgStats.level}
            </span>
            <button
              type="button"
              onClick={(e) => onCycleTheme({ x: e.clientX, y: e.clientY })}
              title="Đổi thời gian trong ngày (Ban ngày / Chiều tối / Đêm khuya)"
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-canvas/85 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <ThemeTimeIcon theme={theme} />
              <span>{THEME_LABELS[theme]}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMapVisible((prev) => !prev)}
            aria-pressed={mapVisible}
            aria-label={mapVisible ? 'Ẩn bản đồ thu nhỏ' : 'Hiện bản đồ thu nhỏ'}
            title={mapVisible ? 'Ẩn Minimap' : 'Hiện Minimap'}
            className={`rounded-lg border p-1 transition-colors ${
              mapVisible
                ? 'border-line bg-canvas/85 text-accent hover:border-line-strong'
                : 'border-line bg-canvas/70 text-ink-faint hover:text-ink'
            }`}
          >
            <MapIcon className="h-3 w-3" />
          </button>
        </div>

        {/* Baseline Cozy RPG gauges: HP / MP / XP */}
        <div className="mt-2 space-y-1.5">
          {/* HP */}
          <div className="space-y-0.5" title="HP sức bền hành trình Aincrad (tăng theo cấp độ đọc)">
            <div className="flex items-center justify-between text-[10px] leading-none">
              <span className="font-semibold tracking-wide text-emerald-600 dark:text-emerald-400">
                HP
              </span>
              <span className="font-mono text-ink-muted">
                {rpgStats.hp}/{rpgStats.maxHp}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Mana */}
          <div className="space-y-0.5" title="Mana tập trung đọc (tích luỹ theo tiến độ đọc gần đây)">
            <div className="flex items-center justify-between text-[10px] leading-none">
              <span className="font-semibold tracking-wide text-sky-600 dark:text-sky-400">
                MP
              </span>
              <span className="font-mono text-ink-muted">
                {rpgStats.mana}/{rpgStats.maxMana}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-400 transition-all duration-300"
                style={{ width: `${manaPct}%` }}
              />
            </div>
          </div>

          {/* XP */}
          <div
            className="space-y-0.5"
            title={`Kinh nghiệm đọc: ${rpgStats.completedBooks} tập hoàn thành · ${rpgStats.readPages} trang đã đọc`}
          >
            <div className="flex items-center justify-between text-[10px] leading-none">
              <span className="font-semibold tracking-wide text-amber-600 dark:text-amber-400">
                XP
              </span>
              <span className="font-mono text-ink-muted">
                {rpgStats.xpInLevel}/{rpgStats.xpForNextLevel}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-300"
                style={{ width: `${Math.max(rpgStats.totalXp > 0 ? 4 : 0, rpgStats.xpPercent)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Collapsible Boss Room Unlock Goal */}
        <div className="mt-2 border-t border-line/75 pt-1.5">
          <button
            type="button"
            onClick={() => setQuestOpen((prev) => !prev)}
            aria-expanded={questOpen}
            className="flex w-full items-center justify-between gap-1 text-left text-[11px] font-semibold text-ink transition-colors hover:text-accent"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {inBossRoom ? (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : bossUnlock.unlocked ? (
                <Unlock className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : (
                <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              <span className="truncate">
                {inBossRoom
                  ? `Phòng Boss F${bossUnlock.floorNumber}`
                  : bossUnlock.unlocked
                    ? `Boss F${bossUnlock.floorNumber} đã mở`
                    : `Mở Phòng Boss F${bossUnlock.floorNumber}`}
              </span>
            </span>
            {questOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
            )}
          </button>

          {questOpen && (
            <div className="mt-1.5 space-y-1.5">
              <p className="truncate text-[10px] font-medium text-ink-muted" title={bossUnlock.bossName}>
                {bossUnlock.bossName}
              </p>
              <div className="flex items-center justify-between gap-2 text-[10px] text-ink-muted">
                <span>
                  {bossUnlock.completedBooks}/{bossUnlock.requiredBooks} tập ·{' '}
                  {bossUnlock.readPages}/{bossUnlock.requiredPages} tr
                </span>
                <span
                  className={`font-mono font-semibold ${
                    bossUnlock.unlocked
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {bossProgressPct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    bossUnlock.unlocked ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.max(bossProgressPct > 0 ? 5 : 0, bossProgressPct)}%` }}
                />
              </div>
              <p className="text-[10px] leading-snug text-ink-faint">
                {inBossRoom
                  ? 'Đi tới Cửa Xanh phía sau để quay lại tầng.'
                  : bossUnlock.unlocked
                    ? 'Phong ấn đã mở — lại gần Cửa Rồng bấm [E]!'
                    : `Đạt ${bossUnlock.requiredBooks} tập hoặc ${bossUnlock.requiredPages} trang bất kỳ.`}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
