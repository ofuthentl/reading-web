import {
  Compass,
  DoorOpen,
  Eye,
  Lock,
  MessageCircle,
  ShieldAlert,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react';
import type {
  BossRoomUnlockStatus,
  FloorWorldLayout3D,
  WorldNpcSpec3D,
  WorldStation3D,
} from './worldTypes';
import type { ActiveWorldPrompt } from './PlayerRig';

export interface WorldQuickBarProps {
  floors: readonly FloorWorldLayout3D[];
  activeFloorIndex: number;
  inBossRoom: boolean;
  bossUnlock: BossRoomUnlockStatus;
  firstPerson: boolean;
  onSelectFloor: (floorIndex: number) => void;
  onExitBossRoom: () => void;
  onToggleFirstPerson: () => void;
}

export function WorldQuickBar({
  floors,
  activeFloorIndex,
  inBossRoom,
  bossUnlock,
  firstPerson,
  onSelectFloor,
  onExitBossRoom,
  onToggleFirstPerson,
}: WorldQuickBarProps) {
  const activeFloor = floors[activeFloorIndex] ?? floors[0];
  if (!activeFloor) return null;

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-line-strong/80 bg-surface/95 px-3 py-2 shadow-md backdrop-blur-md">
      <div className="flex items-center gap-1.5 pr-1">
        {inBossRoom ? (
          <ShieldAlert className="h-4 w-4 text-amber-500" />
        ) : (
          <Compass className="h-4 w-4 text-accent" />
        )}
        <div className="leading-tight">
          <p className="text-xs font-semibold text-ink">
            {inBossRoom
              ? `Phòng Boss Tầng ${activeFloor.floorNumber} · ${bossUnlock.bossName}`
              : activeFloor.title}
          </p>
          <p className="hidden text-[10px] text-ink-muted sm:block">
            {inBossRoom
              ? 'Đấu trường kín 360° — đi tới Cửa Xanh phía sau hoặc bấm Rời Phòng Boss để quay lại'
              : activeFloor.biomeMeta.subtitle}
          </p>
        </div>
      </div>

      {inBossRoom ? (
        <div className="flex flex-1 items-center justify-end gap-2">
          <button
            type="button"
            onClick={onExitBossRoom}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            <DoorOpen className="h-3.5 w-3.5" />
            <span>Rời Phòng Boss</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-hover">
          {floors.map((floor) => {
            const isCurrent = floor.floorIndex === activeFloorIndex;
            return (
              <button
                key={floor.floorIndex}
                type="button"
                onClick={() => onSelectFloor(floor.floorIndex)}
                title={`${floor.title} (${floor.books.length} cuốn)`}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isCurrent
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                Tầng {floor.floorNumber}
                {floor.books.length > 0 ? ` · ${floor.books.length}` : ''}
              </button>
            );
          })}
          <span
            title={bossUnlock.summaryText}
            className={`ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              bossUnlock.unlocked
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            }`}
          >
            {bossUnlock.unlocked ? (
              <Unlock className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            <span>
              Boss: {bossUnlock.completedBooks}/{bossUnlock.requiredBooks} tập ·{' '}
              {bossUnlock.readPages}/{bossUnlock.requiredPages} tr
            </span>
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={onToggleFirstPerson}
        title="Đổi góc nhìn Thứ 3 / Thứ 1 (phím V)"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
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
