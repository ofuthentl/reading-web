import { type ReactNode, Suspense, lazy } from 'react';
import {
  ArrowLeft, Bookmark, ChevronsDown, Headphones, Highlighter, Image as ImageIcon, List, Maximize2, Type,
} from 'lucide-react';
import type { ReaderSettings } from '@/types';
import type { ReaderDrawerTab } from '@/components/ReaderTocDrawer';
import type { ReaderThemePalette } from '@/lib/readerConfig';
import type { ReaderSoundscapeId, SleepTimerMinutes } from '@/lib/readerSoundscapes';

const LazyReaderSettingsPopover = lazy(() =>
  import('@/components/ReaderSettingsPopover').then((mod) => ({
    default: mod.ReaderSettingsPopover,
  })),
);

const LazyReaderSoundscapePopover = lazy(() =>
  import('@/components/ReaderSoundscapePopover').then((mod) => ({
    default: mod.ReaderSoundscapePopover,
  })),
);

export interface ReaderSoundTopBarModel {
  open: boolean;
  preset: ReaderSoundscapeId;
  playbackError?: string | null;
  volume: number;
  pageTurnSound: boolean;
  sleepMinutes: SleepTimerMinutes;
  sleepRemainingSec: number | null;
  onToggleOpen: () => void;
  onClose: () => void;
  onSelectPreset: (preset: ReaderSoundscapeId) => void;
  onChangeVolume: (volume: number) => void;
  onTogglePageTurnSound: (enabled: boolean) => void;
  onSelectSleepMinutes: (minutes: SleepTimerMinutes) => void;
}

export interface ReaderTopBarProps {
  bookTitle: string;
  chapterTitle?: string;
  overallPercent: number;
  immersiveHidden: boolean;
  settingsOpen: boolean;
  settings: ReaderSettings;
  palette: ReaderThemePalette;
  statusBadge?: ReactNode;
  soundModel?: ReaderSoundTopBarModel;
  autoScrollActive?: boolean;
  onToggleAutoScroll?: () => void;
  onBack: () => void;
  onOpenDrawerTab: (tab: ReaderDrawerTab) => void;
  onQuickGuestHighlight?: () => void;
  onHideToolbar: () => void;
  onToggleSettings: () => void;
  onCloseSettings: () => void;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
}

export function ReaderTopBar({
  bookTitle,
  chapterTitle,
  overallPercent,
  immersiveHidden,
  settingsOpen,
  settings,
  palette,
  statusBadge,
  soundModel,
  autoScrollActive = false,
  onToggleAutoScroll,
  onBack,
  onOpenDrawerTab,
  onQuickGuestHighlight,
  onHideToolbar,
  onToggleSettings,
  onCloseSettings,
  onUpdateSettings,
}: ReaderTopBarProps) {
  return (
    <header
      className={`fixed inset-x-0 top-0 ${palette.headerBg} ${palette.border} z-30 flex h-[3.25rem] shrink-0 items-center justify-between border-b px-3 backdrop-blur-md transition-transform duration-200 sm:px-5 ${
        immersiveHidden ? '-translate-y-full pointer-events-none' : 'translate-y-0'
      }`}
    >
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onBack}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${palette.hover}`}
          title="Quay lại Thư viện"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Thư viện</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenDrawerTab('toc')}
          className={`rounded-lg p-2 transition ${palette.hover}`}
          aria-label="Mở mục lục và tìm kiếm"
          title="Mục lục & Tìm trong sách (M)"
        >
          <List className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => onOpenDrawerTab('illustrations')}
          className={`hidden rounded-lg p-2 transition sm:inline-flex ${palette.hover}`}
          aria-label="Minh họa trong tập"
          title="Xem Minh họa trong tập"
        >
          <ImageIcon className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => onOpenDrawerTab('bookmarks')}
          className={`rounded-lg p-2 transition ${palette.hover}`}
          aria-label="Dấu trang và Trích dẫn"
          title="Dấu trang & Trích dẫn (B)"
        >
          <Bookmark className="h-4 w-4" />
        </button>

        {onQuickGuestHighlight && (
          <button
            type="button"
            onClick={onQuickGuestHighlight}
            className={`rounded-lg p-2 transition ${palette.hover}`}
            aria-label="Lưu đoạn đang đọc"
            title="Lưu đoạn đang đọc vào Kho trích dẫn"
          >
            <Highlighter className={`h-4 w-4 ${palette.accentText}`} />
          </button>
        )}

        <div className="min-w-0 pl-1">
          <p className="truncate font-display text-sm font-semibold leading-tight">{bookTitle}</p>
          <p className={`truncate text-[11px] ${palette.textSecondary}`}>
            {chapterTitle} · {overallPercent}%
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {statusBadge}

        {onToggleAutoScroll && settings.layoutMode === 'scroll' && (
          <button
            type="button"
            onClick={onToggleAutoScroll}
            aria-pressed={autoScrollActive}
            className={`rounded-lg p-2 transition ${autoScrollActive ? palette.active : palette.hover}`}
            aria-label="Tự động cuộn trang"
            title="Tự động cuộn rảnh tay"
          >
            <ChevronsDown className={`h-4 w-4 ${autoScrollActive ? palette.accentText : ''}`} />
          </button>
        )}

        {soundModel && (
          <button
            type="button"
            onClick={soundModel.onToggleOpen}
            aria-pressed={soundModel.open || soundModel.preset !== 'off'}
            className={`rounded-lg p-2 transition ${
              soundModel.open || soundModel.preset !== 'off' ? palette.active : palette.hover
            }`}
            aria-label="Âm thanh môi trường đọc sách"
            title="Âm thanh môi trường & Hẹn giờ tắt"
          >
            <Headphones
              className={`h-4 w-4 ${soundModel.preset !== 'off' ? palette.accentText : ''}`}
            />
          </button>
        )}

        <button
          type="button"
          onClick={onHideToolbar}
          className={`rounded-lg p-2 transition ${palette.hover}`}
          aria-label="Ẩn thanh công cụ để tập trung đọc"
          title="Ẩn thanh công cụ (F)"
        >
          <Maximize2 className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToggleSettings}
          className={`rounded-lg p-2 transition ${settingsOpen ? palette.active : palette.hover}`}
          aria-label="Tùy chỉnh trình đọc"
          title="Cài đặt đọc sách"
        >
          <Type className="h-4 w-4" />
        </button>
      </div>

      {soundModel?.open && (
        <Suspense fallback={null}>
          <LazyReaderSoundscapePopover
            preset={soundModel.preset}
            playbackError={soundModel.playbackError}
            volume={soundModel.volume}
            pageTurnSound={soundModel.pageTurnSound}
            sleepMinutes={soundModel.sleepMinutes}
            sleepRemainingSec={soundModel.sleepRemainingSec}
            palette={palette}
            onSelectPreset={soundModel.onSelectPreset}
            onChangeVolume={soundModel.onChangeVolume}
            onTogglePageTurnSound={soundModel.onTogglePageTurnSound}
            onSelectSleepMinutes={soundModel.onSelectSleepMinutes}
            onClose={soundModel.onClose}
          />
        </Suspense>
      )}

      {settingsOpen && (
        <Suspense fallback={null}>
          <LazyReaderSettingsPopover
            settings={settings}
            palette={palette}
            onUpdateSettings={onUpdateSettings}
            onClose={onCloseSettings}
          />
        </Suspense>
      )}
    </header>
  );
}
