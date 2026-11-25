import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bookmark,
  Clock,
  FolderOpen,
  HardDrive,
  LogOut,
  RefreshCw,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { AuthSessionInfo } from '@/types';
import { formatBytes, isCloudMode } from '@/lib/api';
import { formatReadingDuration } from '@/lib/readingStreak';
import {
  type AdminUsageReport,
  type AdminUsageWindowDays,
  fetchAdminUsageReport,
} from '@/lib/usageApi';
import { DailyActivityChart, StorageAndSecurityPanel } from '@/components/AdminUsageCharts';
import { AdminUsageGuestTable } from '@/components/AdminUsageGuestTable';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { UiTheme } from '@/hooks/useTheme';
import type { ToastType } from '@/hooks/useToast';

const LazyAdminR2ReconcileCard = lazy(() =>
  import('@/components/AdminR2ReconcileCard').then((m) => ({
    default: m.AdminR2ReconcileCard,
  })),
);

const LazyAdminBackupCard = lazy(() =>
  import('@/components/AdminBackupCard').then((m) => ({
    default: m.AdminBackupCard,
  })),
);

const LazyAdminRecentCommunityCard = lazy(() =>
  import('@/components/AdminRecentCommunityCard').then((m) => ({
    default: m.AdminRecentCommunityCard,
  })),
);

export interface AdminUsageViewProps {
  theme: UiTheme;
  onCycleTheme: (origin?: { x: number; y: number }) => void;
  onBackToLibrary: () => void;
  onLogout: () => void;
  onSessionReissued?: (nextSession: AuthSessionInfo) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

function formatRelativeTime(timestampMs: number | null): string {
  if (!timestampMs || timestampMs <= 0) return 'Chưa có';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ngày trước`;
  return new Date(timestampMs).toLocaleDateString('vi-VN');
}

export function AdminUsageView({
  theme,
  onCycleTheme,
  onBackToLibrary,
  onLogout,
  onSessionReissued,
  onApiError,
  onNotify,
}: AdminUsageViewProps) {
  const [days, setDays] = useState<AdminUsageWindowDays>(14);
  const [report, setReport] = useState<AdminUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const activeFetchAbortRef = useRef<AbortController | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const sync = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) setHeaderHeight((prev) => (prev === h ? prev : h));
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Chặn trình thu thập dữ liệu đánh chỉ mục trang quản trị /usage (D-035)
  useEffect(() => {
    const existing = document.querySelector('meta[name="robots"]');
    const prevContent = existing?.getAttribute('content') ?? null;
    let created: HTMLMetaElement | null = null;
    if (existing) {
      existing.setAttribute('content', 'noindex, nofollow');
    } else {
      created = document.createElement('meta');
      created.name = 'robots';
      created.content = 'noindex, nofollow';
      document.head.appendChild(created);
    }
    return () => {
      if (created) created.remove();
      else if (existing && prevContent !== null) existing.setAttribute('content', prevContent);
      else if (existing) existing.removeAttribute('content');
    };
  }, []);

  const loadReport = useCallback(
    async (windowDays: AdminUsageWindowDays, externalSignal?: AbortSignal) => {
      activeFetchAbortRef.current?.abort();
      const controller = new AbortController();
      activeFetchAbortRef.current = controller;
      if (externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
          return;
        }
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      setLoading(true);
      try {
        const next = await fetchAdminUsageReport(windowDays, controller.signal);
        if (!controller.signal.aborted) setReport(next);
      } catch (err) {
        if (controller.signal.aborted) return;
        onApiError(err, 'Không thể tải báo cáo thống kê sử dụng.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
        if (activeFetchAbortRef.current === controller) {
          activeFetchAbortRef.current = null;
        }
      }
    },
    [onApiError],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadReport(days, controller.signal);
    return () => {
      controller.abort();
      activeFetchAbortRef.current?.abort();
      activeFetchAbortRef.current = null;
    };
  }, [days, loadReport]);

  return (
    <div className="theme-canvas min-h-screen text-ink transition-colors duration-200">
      <header
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-30 border-b border-line bg-surface md:bg-surface/95 md:backdrop-blur-sm"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5 px-3.5 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToLibrary}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle sm:text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Thư viện</span>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 shrink-0 text-accent" />
                <h1 className="truncate font-display text-base font-semibold text-ink sm:text-lg">
                  Thống kê hệ thống
                </h1>
                <span className="hidden rounded-md border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-muted sm:inline-flex">
                  /usage
                </span>
              </div>
              <p className="hidden text-[11px] text-ink-muted sm:block">
                Chỉ Admin · Không cache · Không lưu IP thô
                {report
                  ? ` · Cập nhật ${new Date(report.generatedAt).toLocaleTimeString('vi-VN')}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="inline-flex rounded-xl border border-line bg-canvas p-1 text-xs">
              {([7, 14, 30] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  className={`rounded-lg px-2.5 py-1 font-medium tabular-nums transition-colors ${
                    days === option
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {option}N
                </button>
              ))}
            </div>

            <ThemeToggle theme={theme} onCycle={onCycleTheme} />

            <button
              type="button"
              onClick={() => void loadReport(days)}
              disabled={loading}
              aria-label="Làm mới thống kê"
              title="Làm mới thống kê"
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
      </header>
      <div
        aria-hidden="true"
        className="h-[64px]"
        style={headerHeight !== null ? { height: `${headerHeight}px` } : undefined}
      />

      <main className="mx-auto flex max-w-7xl flex-col gap-6 overflow-x-clip px-4 py-6 sm:px-6 sm:py-8">
        {!isCloudMode && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
            Đang chạy ở chế độ Local Dev (không nối Cloudflare Worker) nên chỉ hiển thị số liệu sách cục bộ trong IndexedDB.
          </div>
        )}

        {loading && !report ? (
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-24 animate-pulse rounded-2xl border border-line bg-surface"
              />
            ))}
          </div>
        ) : report ? (
          <>
            {/* 6 thẻ KPI tổng quan */}
            <section
              aria-label="Chỉ số tổng quan"
              className="grid grid-cols-2 gap-3.5 lg:grid-cols-3"
            >
              <div className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm dark:border-line-strong/60">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>Phiên khách 24h</span>
                  <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">
                  {report.overview.activeGuestSessions24h}
                  <span className="ml-1.5 text-sm font-normal text-ink-muted">
                    / {report.overview.totalGuests} khách
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Cấp key {days}N: {report.overview.windowTotals.discordKeysIssued} · Đăng nhập:{' '}
                  {report.overview.windowTotals.guestLogins}
                </p>
              </div>

              <div className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm dark:border-line-strong/60">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>Độc giả hoạt động</span>
                  <Activity className="h-4 w-4 text-accent" />
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">
                  {report.overview.uniqueReaders7d}
                  <span className="ml-1.5 text-sm font-normal text-ink-muted">
                    (7N) · {report.overview.uniqueReaders30d} (30N)
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Khách Discord: {report.overview.guestReaders7d} (7N) ·{' '}
                  {report.overview.guestReaders30d} (30N)
                </p>
              </div>

              <div className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm dark:border-line-strong/60">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>Thời gian đọc ({days} ngày)</span>
                  <Clock className="h-4 w-4 text-crimson-accent" />
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">
                  {formatReadingDuration(
                    report.overview.windowTotals.totalReadingSeconds ?? 0,
                    true,
                  )}
                  <span className="ml-1.5 text-sm font-normal text-ink-muted">
                    · {report.overview.windowTotals.guestChapterReads} chương khách
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  30N: {formatReadingDuration(report.overview.readingSeconds30d ?? 0, true)} (Khách{' '}
                  {formatReadingDuration(report.overview.guestReadingSeconds30d ?? 0, true)} · Admin{' '}
                  {formatReadingDuration(report.overview.ownerReadingSeconds30d ?? 0, true)})
                </p>
              </div>

              <div className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm dark:border-line-strong/60">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>Kho sách &amp; Bảo vệ</span>
                  <Shield className="h-4 w-4 text-accent" />
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">
                  {report.overview.totalBooks}
                  <span className="ml-1.5 text-sm font-normal text-ink-muted">
                    cuốn · {report.overview.totalShelves} kệ
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Gói bảo mật: {report.overview.guestReadyBooks}/{report.overview.totalBooks} · Kệ
                  khoá: {report.overview.restrictedShelves}
                </p>
              </div>

              <div className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm dark:border-line-strong/60">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>Hoàn thành &amp; Dấu trang</span>
                  <Bookmark className="h-4 w-4 text-crimson-accent" />
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">
                  {report.overview.ownerCompletedBooks + report.overview.guestCompletedBooks}
                  <span className="ml-1.5 text-sm font-normal text-ink-muted">lượt đọc xong</span>
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Admin: {report.overview.ownerCompletedBooks} · Khách:{' '}
                  {report.overview.guestCompletedBooks} · Dấu trang:{' '}
                  {report.overview.totalBookmarks}
                </p>
              </div>

              <div className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm dark:border-line-strong/60">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>Dung lượng R2</span>
                  <HardDrive className="h-4 w-4 text-accent" />
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">
                  {formatBytes(report.storage.usedBytes)}
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Còn trống {formatBytes(report.storage.remainingBytes)} /{' '}
                  {formatBytes(report.storage.limitBytes)}
                </p>
              </div>
            </section>

            {/* Biểu đồ xu hướng + Phân bổ R2 & An toàn */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <DailyActivityChart series={report.dailySeries} days={report.days} />
              </div>
              <StorageAndSecurityPanel
                storage={report.storage}
                security={report.security}
                overview={report.overview}
                onOpenReconcile={() => {
                  document
                    .getElementById('r2-storage-reconcile')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                onRevokedLogout={onLogout}
                onSessionReissued={onSessionReissued}
                onApiError={onApiError}
                onNotify={onNotify}
              />
            </div>

            <Suspense fallback={null}>
              <LazyAdminR2ReconcileCard
                onApiError={onApiError}
                onNotify={onNotify}
                onCleanedUp={() => void loadReport(days)}
              />
            </Suspense>

            <Suspense fallback={null}>
              <LazyAdminBackupCard
                onApiError={onApiError}
                onNotify={onNotify}
                onImported={() => void loadReport(days)}
              />
            </Suspense>

            {/* Top Tập đọc nhiều & Top Bộ truyện */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <section className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/60">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink">
                    <BookOpen className="h-4 w-4 text-crimson-accent" />
                    <span>Tập được đọc nhiều nhất</span>
                  </h2>
                  <span className="text-[11px] text-ink-faint">Ưu tiên {days} ngày gần đây</span>
                </div>

                {report.topBooks.length === 0 ? (
                  <p className="py-8 text-center text-xs text-ink-muted">
                    Chưa có dữ liệu tiến độ đọc nào trong hệ thống.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-line/70">
                    {report.topBooks.map((book, idx) => (
                      <div key={book.id} className="flex items-center gap-3 py-2.5">
                        <span className="w-5 shrink-0 text-center font-mono text-xs font-semibold text-ink-faint">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-semibold text-ink">{book.title}</p>
                            {book.hasGuestPack && (
                              <ShieldCheck
                                className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                                aria-label="Đã có gói bảo mật khách"
                              />
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                            <span className="shrink-0 tabular-nums text-ink/85">
                              {book.readersTotal} độc giả ({book.guestReaders} khách) ·{' '}
                              {book.completedTotal} xong
                              {book.readingSecondsTotal > 0
                                ? ` · ${formatReadingDuration(book.readingSecondsTotal, true)}`
                                : ''}
                            </span>
                            <span className="shrink-0 text-ink-faint">·</span>
                            <span className="truncate">{book.shelf}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-semibold tabular-nums text-ink">
                            TB {book.avgPercent}%
                          </p>
                          <p className="text-[10px] text-ink-faint">
                            {formatRelativeTime(book.lastReadAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="moonlit-card rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/60">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink">
                    <FolderOpen className="h-4 w-4 text-accent" />
                    <span>Bộ truyện được quan tâm</span>
                  </h2>
                  <span className="text-[11px] text-ink-faint">Top {report.topShelves.length} bộ</span>
                </div>

                {report.topShelves.length === 0 ? (
                  <p className="py-8 text-center text-xs text-ink-muted">
                    Chưa có bộ truyện nào ghi nhận lượt đọc.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-line/70">
                    {report.topShelves.map((shelf, idx) => (
                      <div key={shelf.shelf} className="flex items-center gap-3 py-2.5">
                        <span className="w-5 shrink-0 text-center font-mono text-xs font-semibold text-ink-faint">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-ink">{shelf.shelf}</p>
                          <p className="text-[11px] text-ink-muted">
                            {shelf.bookCount} tập · {shelf.activeReaders} độc giả ·{' '}
                            {shelf.completedReads} lượt đọc xong
                            {shelf.readingSecondsTotal > 0
                              ? ` · ${formatReadingDuration(shelf.readingSecondsTotal, true)}`
                              : ''}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-ink-faint">
                          {formatRelativeTime(shelf.lastReadAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Bảng hoạt động Thành viên Discord */}
            <AdminUsageGuestTable
              guests={report.guestActivity}
              formatRelativeTime={formatRelativeTime}
              onApiError={onApiError}
            />

            <Suspense fallback={null}>
              <LazyAdminRecentCommunityCard
                formatRelativeTime={formatRelativeTime}
                onApiError={onApiError}
                onNotify={onNotify}
              />
            </Suspense>
          </>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink-muted">
            Không tải được dữ liệu thống kê. Hãy bấm Làm mới để thử lại.
          </div>
        )}
      </main>
    </div>
  );
}
