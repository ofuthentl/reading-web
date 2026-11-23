import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  DoorOpen,
  Eye,
  Lock,
  MessageCircle,
  Search,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Book } from '@/types';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';
import type {
  BiomeId,
  BossRoomUnlockStatus,
  FloorWorldLayout3D,
  WorldNpcSpec3D,
  WorldStation3D,
} from './worldTypes';
import type { ActiveWorldPrompt } from './PlayerRig';

const BIOME_DOT_CLASS: Record<BiomeId, string> = {
  town_of_beginnings: 'bg-amber-500',
  sakura_shrine: 'bg-rose-400',
  starfield_atrium: 'bg-sky-400',
  starlight_ruins: 'bg-violet-400',
};

export interface WorldQuickBarProps {
  floors: readonly FloorWorldLayout3D[];
  activeFloorIndex: number;
  inBossRoom: boolean;
  bossUnlock: BossRoomUnlockStatus;
  firstPerson: boolean;
  audioEnabled: boolean;
  searchQuery: string;
  matchingBooks: readonly Book[];
  onSearchQueryChange: (query: string) => void;
  onJumpToBook: (book: Book) => void;
  onSelectFloor: (floorIndex: number) => void;
  onExitBossRoom: () => void;
  onToggleAudio: () => void;
  onToggleFirstPerson: () => void;
}

/**
 * Compact top-right 3D world control bar (`<= z-20`):
 * - Scalable Floor Dropdown/Popover (handles 10–100+ floors cleanly without horizontal overflow)
 * - Cross-floor accent-insensitive Book Search popover
 * - Ambient Web Audio toggle button (default OFF)
 * - Third-person / First-person (`V`) toggle & Boss Room exit shortcut
 */
export function WorldQuickBar({
  floors,
  activeFloorIndex,
  inBossRoom,
  bossUnlock,
  firstPerson,
  audioEnabled,
  searchQuery,
  matchingBooks,
  onSearchQueryChange,
  onJumpToBook,
  onSelectFloor,
  onExitBossRoom,
  onToggleAudio,
  onToggleFirstPerson,
}: WorldQuickBarProps) {
  const [floorMenuOpen, setFloorMenuOpen] = useState(false);
  const [floorFilter, setFloorFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const barRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const activeFloor = floors[activeFloorIndex] ?? floors[0];

  // Close popovers on outside click or Escape
  useEffect(() => {
    if (!floorMenuOpen && !searchOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setFloorMenuOpen(false);
        setSearchOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFloorMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [floorMenuOpen, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  const filteredFloors = useMemo(() => {
    const q = normalizeSearchText(floorFilter);
    if (!q) return floors;
    return floors.filter((f) => {
      const hay = normalizeSearchText(`tang ${f.floorNumber} f${f.floorNumber} ${f.title} ${f.biomeMeta.label}`);
      return hay.includes(q);
    });
  }, [floors, floorFilter]);

  if (!activeFloor) return null;

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div
      ref={barRef}
      className="pointer-events-auto relative flex flex-wrap items-center justify-end gap-1.5 rounded-2xl border border-line-strong bg-surface/95 px-2.5 py-1.5 shadow-xl backdrop-blur-md"
    >
      {/* Scalable Floor Dropdown Trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setFloorMenuOpen((prev) => !prev);
            setSearchOpen(false);
          }}
          aria-expanded={floorMenuOpen}
          aria-haspopup="listbox"
          title={inBossRoom ? `Phòng Boss Tầng ${activeFloor.floorNumber} · ${bossUnlock.bossName}` : activeFloor.title}
          className={`inline-flex max-w-[240px] items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            inBossRoom
              ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'
              : 'border-line bg-canvas text-ink hover:border-line-strong hover:bg-subtle'
          }`}
        >
          {inBossRoom ? (
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : (
            <Compass className="h-3.5 w-3.5 shrink-0 text-accent" />
          )}
          <span className="truncate">
            {inBossRoom
              ? `Phòng Boss F${activeFloor.floorNumber}`
              : `Tầng ${activeFloor.floorNumber}/${floors.length} · ${activeFloor.biomeMeta.label}`}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform ${
              floorMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {floorMenuOpen && (
          <div
            role="listbox"
            aria-label="Chọn tầng Aincrad Reading Tower"
            className="absolute right-0 top-[calc(100%+8px)] z-20 w-72 overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl"
          >
            <div className="border-b border-line/75 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-ink">
                  Tháp Aincrad ({floors.length} tầng)
                </p>
                <span className="text-[10px] text-ink-faint">Chọn để dịch chuyển</span>
              </div>
              {floors.length > 6 && (
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="text"
                    value={floorFilter}
                    onChange={(e) => setFloorFilter(e.target.value)}
                    placeholder="Lọc tầng hoặc biome..."
                    className="w-full rounded-lg border border-line bg-canvas py-1 pl-7 pr-2 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="max-h-72 space-y-0.5 overflow-y-auto p-1.5 scrollbar-thin">
              {filteredFloors.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-ink-muted">
                  Không tìm thấy tầng phù hợp
                </p>
              ) : (
                filteredFloors.map((floor) => {
                  const isCurrent = floor.floorIndex === activeFloorIndex && !inBossRoom;
                  return (
                    <button
                      key={floor.floorIndex}
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      onClick={() => {
                        onSelectFloor(floor.floorIndex);
                        setFloorMenuOpen(false);
                        setFloorFilter('');
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                        isCurrent
                          ? 'bg-accent/15 text-ink ring-1 ring-accent/40'
                          : 'text-ink hover:bg-subtle'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${BIOME_DOT_CLASS[floor.biomeId]}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold leading-tight">
                          Tầng {floor.floorNumber} · {floor.biomeMeta.label}
                        </p>
                        <p className="truncate text-[10px] text-ink-muted">
                          {floor.books.length > 0
                            ? `${floor.books.length} cuốn · ${floor.bookcases.length} tủ`
                            : floor.biomeMeta.subtitle}
                        </p>
                      </div>
                      {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Boss Room Exit Button */}
      {inBossRoom && (
        <button
          type="button"
          onClick={onExitBossRoom}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <DoorOpen className="h-3.5 w-3.5" />
          <span>Rời Boss</span>
        </button>
      )}

      {/* Cross-floor Book Search Toggle & Popover */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setSearchOpen((prev) => !prev);
            setFloorMenuOpen(false);
          }}
          aria-expanded={searchOpen}
          aria-label="Tìm sách xuyên tầng"
          title="Tìm kiếm sách & nhảy thẳng tới kệ"
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs font-medium transition-colors ${
            hasSearch || searchOpen
              ? 'border-accent/60 bg-accent/15 text-accent'
              : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          {hasSearch && <span className="max-w-[76px] truncate text-[11px]">{searchQuery}</span>}
        </button>

        {searchOpen && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-72 overflow-hidden rounded-2xl border border-line-strong bg-surface p-2.5 shadow-2xl">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-faint" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Tìm tên sách, tác giả, kệ..."
                className="w-full rounded-xl border border-line bg-canvas py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
              {hasSearch && (
                <button
                  type="button"
                  onClick={() => onSearchQueryChange('')}
                  aria-label="Xoá từ khoá tìm kiếm"
                  className="absolute right-1.5 rounded-md p-0.5 text-ink-faint hover:bg-subtle hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {hasSearch ? (
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto scrollbar-thin">
                {matchingBooks.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-ink-muted">
                    Không tìm thấy cuốn sách phù hợp
                  </p>
                ) : (
                  matchingBooks.slice(0, 6).map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      onClick={() => {
                        onJumpToBook(book);
                        setSearchOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-subtle"
                    >
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink">{book.title}</p>
                        <p className="truncate text-[10px] text-ink-muted">
                          {book.shelf} · {book.author}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-ink-faint">
                Gõ không dấu để dịch chuyển thẳng tới đúng tầng &amp; cuốn sách.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Ambient Audio Toggle (default OFF) */}
      <button
        type="button"
        onClick={onToggleAudio}
        aria-pressed={audioEnabled}
        aria-label={audioEnabled ? 'Tắt âm thanh môi trường' : 'Bật âm thanh môi trường'}
        title={audioEnabled ? 'Đang bật âm thanh môi trường (bấm để tắt)' : 'Bật âm thanh môi trường dịu nhẹ'}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          audioEnabled
            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
            : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
        }`}
      >
        {audioEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        <span className="hidden xl:inline">{audioEnabled ? 'Âm bật' : 'Âm tắt'}</span>
      </button>

      {/* Third-Person / First-Person Toggle (V) */}
      <button
        type="button"
        onClick={onToggleFirstPerson}
        title="Đổi góc nhìn Thứ 3 / Thứ 1 (phím V)"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-canvas/90 px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
      >
        <Eye className="h-3.5 w-3.5 text-accent" />
        <span>{firstPerson ? 'Thứ 1 (V)' : 'Thứ 3 (V)'}</span>
      </button>
    </div>
  );
}

export interface WorldInteractToastProps {
  prompt: ActiveWorldPrompt | null;
  activeDialogue: WorldNpcSpec3D | null;
  bossUnlock: BossRoomUnlockStatus;
  bossSealNotice: string | null;
  onTriggerStation: (station: WorldStation3D) => void;
  onTriggerNpc: (npc: WorldNpcSpec3D) => void;
  onCloseDialogue: () => void;
  onCloseBossNotice: () => void;
}

export function WorldInteractToast({
  prompt,
  activeDialogue,
  bossUnlock,
  bossSealNotice,
  onTriggerStation,
  onTriggerNpc,
  onCloseDialogue,
  onCloseBossNotice,
}: WorldInteractToastProps) {
  const isLockedBossPrompt =
    prompt?.kind === 'station' && prompt.station.kind === 'boss_door' && !bossUnlock.unlocked;

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      {bossSealNotice && (
        <div className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl border border-amber-500/60 bg-surface/95 px-4 py-3 text-left shadow-xl backdrop-blur-md">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <Lock className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink">Cửa Phòng Boss đang phong ấn</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{bossSealNotice}</p>
          </div>
          <button
            type="button"
            onClick={onCloseBossNotice}
            aria-label="Đóng thông báo phong ấn"
            className="rounded-lg p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {activeDialogue && (
        <div className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl border border-accent/50 bg-surface/95 px-4 py-3 text-left shadow-xl backdrop-blur-md">
          <div
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: activeDialogue.accentColor }}
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink">{activeDialogue.name}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              {activeDialogue.greeting}
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseDialogue}
            aria-label="Đóng thoại NPC"
            className="rounded-lg p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {prompt && (
        <button
          type="button"
          onClick={() => {
            if (prompt.kind === 'station') onTriggerStation(prompt.station);
            else onTriggerNpc(prompt.npc);
          }}
          className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border bg-surface/95 px-4 py-1.5 text-xs font-medium text-ink shadow-lg backdrop-blur-md transition-transform hover:scale-[1.02] ${
            isLockedBossPrompt
              ? 'border-amber-500/60 hover:border-amber-500'
              : 'border-accent/60 hover:border-accent'
          }`}
        >
          <kbd
            className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
              isLockedBossPrompt
                ? 'bg-amber-500 text-white'
                : 'bg-accent text-accent-foreground'
            }`}
          >
            E
          </kbd>
          {isLockedBossPrompt ? (
            <Lock className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-accent" />
          )}
          <span>
            {prompt.kind === 'station'
              ? prompt.station.kind === 'boss_door'
                ? bossUnlock.unlocked
                  ? `Mở Cửa Phòng Boss — Đối mặt ${bossUnlock.bossName}`
                  : `Cửa Phòng Boss đang khoá (${bossUnlock.completedBooks}/${bossUnlock.requiredBooks} tập · ${bossUnlock.readPages}/${bossUnlock.requiredPages} tr)`
                : `${prompt.station.label} — ${prompt.station.prompt}`
              : `Trò chuyện với ${prompt.npc.name}`}
          </span>
        </button>
      )}
    </div>
  );
}
