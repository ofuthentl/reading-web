import { useEffect, useRef, useState } from 'react';
import {
  CheckSquare,
  Database,
  HeartPulse,
  MoreHorizontal,
  Shield,
} from 'lucide-react';
import { isCloudMode } from '@/lib/api';

interface LibraryMobileOwnerMenuProps {
  bookCount: number;
  selectionMode: boolean;
  showSelectionToggle: boolean;
  unprotectedBookCount: number;
  onOpenCacheManager?: () => void;
  onOpenLibraryHealth?: () => void;
  onProtectionClick?: () => void;
  onToggleSelectionMode: () => void;
}

/**
 * Menu gọn (`⋯`) trên mobile/tablet cho Owner mở nhanh Bộ nhớ đệm thiết bị,
 * Sức khoẻ kho sách, Bảo mật & Gói khách và Chế độ chọn nhiều sách.
 */
export function LibraryMobileOwnerMenu({
  bookCount,
  selectionMode,
  showSelectionToggle,
  unprotectedBookCount,
  onOpenCacheManager,
  onOpenLibraryHealth,
  onProtectionClick,
  onToggleSelectionMode,
}: LibraryMobileOwnerMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const hasAnyItem = Boolean(
    onOpenCacheManager ||
      (onOpenLibraryHealth && bookCount > 0) ||
      (isCloudMode && onProtectionClick) ||
      showSelectionToggle,
  );
  if (!hasAnyItem) return null;

  return (
    <div ref={menuRef} className="relative lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Công cụ quản trị khác"
        title="Công cụ quản trị (Bộ nhớ đệm, Sức khoẻ kho, Bảo mật)"
        className={`relative inline-flex items-center rounded-xl border p-2 transition-colors ${
          open
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
        }`}
      >
        <MoreHorizontal className="h-4 w-4" />
        {unprotectedBookCount > 0 && isCloudMode && onProtectionClick && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 sm:hidden"
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="moonlit-card absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl dark:border-line-strong/80"
        >
          {onOpenCacheManager && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenCacheManager();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-subtle"
            >
              <Database className="h-4 w-4 shrink-0 text-accent" />
              <span>Bộ nhớ đệm thiết bị</span>
            </button>
          )}
          {onOpenLibraryHealth && bookCount > 0 && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenLibraryHealth();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-subtle sm:hidden"
            >
              <HeartPulse className="h-4 w-4 shrink-0 text-accent" />
              <span>Sức khoẻ kho sách</span>
            </button>
          )}
          {isCloudMode && onProtectionClick && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onProtectionClick();
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-subtle sm:hidden"
            >
              <span className="inline-flex items-center gap-2.5">
                <Shield className="h-4 w-4 shrink-0 text-accent" />
                <span>Bảo mật &amp; Gói khách</span>
              </span>
              {unprotectedBookCount > 0 && (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-700 dark:text-amber-300">
                  {unprotectedBookCount}
                </span>
              )}
            </button>
          )}
          {showSelectionToggle && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onToggleSelectionMode();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-subtle sm:hidden"
            >
              <CheckSquare className="h-4 w-4 shrink-0 text-accent" />
              <span>{selectionMode ? 'Thoát chế độ chọn' : 'Chọn nhiều sách'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
