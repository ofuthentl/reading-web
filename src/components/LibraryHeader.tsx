import { useEffect, useState } from 'react';
import {
  BarChart3,
  CheckSquare,
  Clock,
  HardDrive,
  Heart,
  Home,
  Library,
  LogOut,
  RefreshCw,
  Shield,
  Upload,
} from 'lucide-react';
import type { AuthRole, LibraryTab, StorageStats, ViewMode } from '@/types';
import { HARD_LIMIT_BYTES, formatBytes, isCloudMode } from '@/lib/api';
import { formatRemainingSessionTime } from '@/lib/authSession';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import type { AppTheme } from '@/hooks/useTheme';

interface LibraryHeaderProps {
  storage: StorageStats | null;
  hideStorage?: boolean;
  bookCount: number;
  loading: boolean;
  theme: AppTheme;
  selectionMode: boolean;
  selectedCount: number;
  showSelectionToggle?: boolean;
  sessionRole?: AuthRole;
  sessionExpiresAt?: number | null;
  activeTab?: LibraryTab;
  onChangeTab?: (tab: LibraryTab) => void;
  canUse3D?: boolean;
  viewMode?: ViewMode;
  onChangeViewMode?: (mode: ViewMode) => void;
  onCycleTheme: (origin?: { x: number; y: number }) => void;
  onOpenStats?: () => void;
  onUploadClick?: () => void;
  onProtectionClick?: () => void;
  unprotectedBookCount?: number;
  onToggleSelectionMode: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

const NAV_TABS: Array<{ id: LibraryTab; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Trang chủ', icon: Home },
  { id: 'library', label: 'Thư viện', icon: Library },
  { id: 'support', label: 'Ủng hộ', icon: Heart },
];

export function LibraryHeader({
  storage,
  hideStorage = false,
  bookCount,
  loading,
  theme,
  selectionMode,
  selectedCount,
  showSelectionToggle = true,
  sessionRole = 'owner',
  sessionExpiresAt = null,
  activeTab,
  onChangeTab,
  canUse3D = false,
  viewMode = '2d',
  onChangeViewMode,
  onCycleTheme,
  onOpenStats,
  onUploadClick,
  onProtectionClick,
  unprotectedBookCount = 0,
  onToggleSelectionMode,
  onRefresh,
  onLogout,
}: LibraryHeaderProps) {
  const isOwner = sessionRole === 'owner';
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (isOwner || sessionExpiresAt === null) return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [isOwner, sessionExpiresAt]);

  const usedBytes = storage?.usedBytes ?? 0;
  const limitBytes = storage?.limitBytes || HARD_LIMIT_BYTES;
  const usagePercent = Math.min(100, Math.max(0, (usedBytes / limitBytes) * 100));
  const showTabs = Boolean(activeTab && onChangeTab);

  const barToneClass =
    usagePercent >= 90
      ? 'bg-red-700 dark:bg-red-500'
      : usagePercent >= 75
        ? 'bg-amber-700 dark:bg-amber-500'
        : 'bg-crimson-accent';

  const renderTabButtons = (compact: boolean) =>
    NAV_TABS.map(({ id, label, icon: Icon }) => {
      const isActive = activeTab === id;
      return (
        <button
          key={id}
          type="button"
          aria-current={isActive ? 'page' : undefined}
          onClick={() => onChangeTab?.(id)}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-colors ${
            compact ? 'justify-center text-xs' : 'text-sm'
          } ${
            isActive
              ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong/80'
              : 'text-ink-muted hover:bg-subtle/70 hover:text-ink'
          }`}
        >
          <Icon
            className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${
              isActive ? (id === 'support' ? 'text-crimson-accent' : 'text-accent') : ''
            }`}
          />
          <span>{label}</span>
        </button>
      );
    });

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-sm transition-colors duration-200 dark:shadow-[0_1px_0_rgba(241,241,241,0.04)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3.5 py-3 sm:gap-3 sm:px-6">
        {/* Thương hiệu + Thanh tab điều hướng (Desktop) */}
        <div className="flex min-w-0 items-center gap-2.5 sm:shrink-0 sm:gap-3 lg:gap-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <img
              src={`${import.meta.env.BASE_URL}logo-128.png`}
              alt=""
              width={40}
              height={40}
              decoding="async"
              className="h-8 w-8 shrink-0 select-none object-contain sm:h-10 sm:w-10"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate whitespace-nowrap font-display text-base font-semibold tracking-tight text-ink sm:text-xl">
                  Ofu&apos;s Library
                </h1>
                {!isCloudMode && (
                  <span className="hidden shrink-0 rounded-md border border-line bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-muted sm:inline-flex">
                    Local Dev
                  </span>
                )}
              </div>
              <p className="hidden text-xs text-ink-muted sm:block">
                {bookCount} cuốn sách trong kho
              </p>
            </div>
          </div>

          {showTabs && onChangeTab && (
            <nav
              aria-label="Điều hướng thư viện"
              className="hidden shrink-0 items-center gap-1 rounded-xl border border-line bg-canvas p-1 md:flex"
            >
              {renderTabButtons(false)}
            </nav>
          )}
        </div>

        {/* Thanh dung lượng (Desktop — chỉ hiển thị cho Admin/Owner khi không dời xuống thân trang) */}
        {isOwner && !hideStorage && (
          <div
            className={`hidden min-w-[160px] max-w-[240px] flex-1 flex-col gap-1.5 rounded-xl border border-line bg-canvas px-3 py-2 ${
              showTabs ? 'xl:flex' : 'lg:flex'
            }`}
            title={`Đã dùng ${formatBytes(usedBytes)} / ${formatBytes(limitBytes)}`}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <HardDrive className="h-3.5 w-3.5 text-accent" />
                Dung lượng
              </span>
              <span className="font-medium text-ink">
                {formatBytes(usedBytes)}{' '}
                <span className="font-normal text-ink-muted">/ {formatBytes(limitBytes)}</span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barToneClass}`}
                style={{ width: `${usedBytes > 0 ? Math.max(usagePercent, 1.5) : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Cụm nút hành động */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {!isOwner && sessionExpiresAt !== null && (
            <span
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-2.5 py-2 text-xs font-medium text-ink-muted"
              title={`Quyền đọc hết hạn lúc ${new Date(sessionExpiresAt).toLocaleString('vi-VN')}`}
            >
              <Clock className="h-3.5 w-3.5 shrink-0 text-accent" />
              <span className="whitespace-nowrap">
                {formatRemainingSessionTime(sessionExpiresAt, nowTick)}
              </span>
            </span>
          )}

          {isOwner && onUploadClick && (
            <button
              type="button"
              onClick={onUploadClick}
              aria-label="Tải sách lên"
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent p-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover sm:px-3 dark:shadow-[0_0_20px_-6px_rgba(244,244,245,0.26)]"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Tải sách</span>
            </button>
          )}

          {isOwner && isCloudMode && onProtectionClick && (
            <button
              type="button"
              onClick={onProtectionClick}
              aria-label="Bảo mật chế độ khách và truy vết rò rỉ"
              title={
                unprotectedBookCount > 0
                  ? `Còn ${unprotectedBookCount} sách EPUB/DOCX chưa đồng bộ gói bảo mật khách`
                  : 'Bảo mật chế độ khách & Truy vết rò rỉ'
              }
              className="relative hidden items-center gap-1.5 rounded-xl border border-line bg-canvas px-2.5 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink sm:inline-flex"
            >
              <Shield className="h-4 w-4 text-accent" />
              {unprotectedBookCount > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold leading-none tabular-nums text-amber-700 dark:text-amber-300">
                  {unprotectedBookCount}
                </span>
              )}
            </button>
          )}

          {isOwner && showSelectionToggle && (
            <button
              type="button"
              onClick={onToggleSelectionMode}
              aria-pressed={selectionMode}
              aria-label={selectionMode ? 'Thoát chế độ chọn nhiều' : 'Chọn nhiều sách'}
              title={selectionMode ? 'Thoát chế độ chọn' : 'Chọn nhiều sách'}
              className={`hidden items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-medium transition-colors sm:inline-flex ${
                selectionMode
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line bg-canvas text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              <span className="hidden md:inline">
                {selectionMode
                  ? selectedCount > 0
                    ? `Đang chọn (${selectedCount})`
                    : 'Đang chọn'
                  : 'Chọn'}
              </span>
            </button>
          )}

          {isOwner && canUse3D && onChangeViewMode && (
            <ViewModeToggle
              canUse3D={canUse3D}
              viewMode={viewMode}
              onChange={onChangeViewMode}
            />
          )}

          <ThemeToggle theme={theme} onCycle={onCycleTheme} />

          {onOpenStats && bookCount > 0 && (
            <button
              type="button"
              onClick={onOpenStats}
              aria-label="Thống kê đọc sách"
              title="Thống kê đọc sách"
              className="rounded-xl border border-line bg-canvas p-2 text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
            >
              <BarChart3 className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Làm mới thư viện"
            title="Làm mới thư viện"
            className="rounded-xl border border-line bg-canvas p-2 text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onLogout}
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="rounded-xl border border-line bg-canvas p-2 text-ink-muted transition-colors hover:border-red-700/35 hover:bg-subtle hover:text-red-700 dark:hover:border-red-400/35 dark:hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Thanh tab điều hướng gọn cho Mobile */}
      {showTabs && onChangeTab && (
        <nav
          aria-label="Điều hướng thư viện"
          className="border-t border-line/70 bg-surface/90 px-4 py-1.5 md:hidden"
        >
          <div className="mx-auto grid max-w-7xl grid-cols-3 gap-1.5 rounded-xl border border-line bg-canvas p-1">
            {renderTabButtons(true)}
          </div>
        </nav>
      )}

      {/* Thanh dung lượng gọn cho Mobile / Tablet (chỉ hiển thị cho Admin/Owner khi không dời xuống thân trang) */}
      {isOwner && !hideStorage && (
        <div
          className={`border-t border-line/70 bg-canvas/60 px-4 py-2 ${
            showTabs ? 'xl:hidden' : 'lg:hidden'
          }`}
        >
          <div className="mx-auto flex max-w-7xl items-center gap-3 text-xs">
            <span className="inline-flex shrink-0 items-center gap-1.5 text-ink-muted">
              <HardDrive className="h-3.5 w-3.5 text-accent" />
              <span>{bookCount} sách</span>
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barToneClass}`}
                style={{ width: `${usedBytes > 0 ? Math.max(usagePercent, 1.5) : 0}%` }}
              />
            </div>
            <span className="shrink-0 font-medium text-ink">
              {formatBytes(usedBytes)}{' '}
              <span className="font-normal text-ink-muted">/ {formatBytes(limitBytes)}</span>
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
