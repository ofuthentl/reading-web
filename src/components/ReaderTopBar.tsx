import type { ReactNode } from 'react';
import { ArrowLeft, Bookmark, List, Maximize2, Type } from 'lucide-react';
import type { ReaderSettings } from '@/types';
import { ReaderSettingsPopover } from '@/components/ReaderSettingsPopover';
import type { ReaderDrawerTab } from '@/components/ReaderTocDrawer';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface ReaderTopBarProps {
  bookTitle: string;
  chapterTitle?: string;
  overallPercent: number;
  isPdf?: boolean;
  immersiveHidden: boolean;
  settingsOpen: boolean;
  settings: ReaderSettings;
  palette: ReaderThemePalette;
  statusBadge?: ReactNode;
  onBack: () => void;
  onOpenDrawerTab: (tab: ReaderDrawerTab) => void;
  onHideToolbar: () => void;
  onToggleSettings: () => void;
  onCloseSettings: () => void;
  onUpdateSettings: (next: Partial<ReaderSettings>) => void;
}

export function ReaderTopBar({
  bookTitle,
  chapterTitle,
  overallPercent,
  isPdf = false,
  immersiveHidden,
  settingsOpen,
  settings,
  palette,
  statusBadge,
  onBack,
  onOpenDrawerTab,
  onHideToolbar,
  onToggleSettings,
  onCloseSettings,
  onUpdateSettings,
}: ReaderTopBarProps) {
  return (
    <header
      className={`${
        isPdf
          ? 'relative border-line bg-surface/95'
          : `fixed inset-x-0 top-0 ${palette.headerBg} ${palette.border}`
      } z-30 flex h-[3.25rem] shrink-0 items-center justify-between border-b px-3 backdrop-blur-md transition-transform duration-200 sm:px-5 ${
        !isPdf && immersiveHidden ? '-translate-y-full pointer-events-none' : 'translate-y-0'
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
          onClick={() => onOpenDrawerTab('bookmarks')}
          className={`rounded-lg p-2 transition ${palette.hover}`}
          aria-label="Dấu trang"
          title="Dấu trang & Ghi chú (B)"
        >
          <Bookmark className="h-4 w-4" />
        </button>

        <div className="min-w-0 pl-1">
          <p className="truncate font-display text-sm font-semibold leading-tight">{bookTitle}</p>
          <p className={`truncate text-[11px] ${palette.textSecondary}`}>
            {chapterTitle} · {overallPercent}%
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {statusBadge}

        {!isPdf && (
          <>
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
          </>
        )}
      </div>

      {settingsOpen && !isPdf && (
        <ReaderSettingsPopover
          settings={settings}
          palette={palette}
          onUpdateSettings={onUpdateSettings}
          onClose={onCloseSettings}
        />
      )}
    </header>
  );
}
