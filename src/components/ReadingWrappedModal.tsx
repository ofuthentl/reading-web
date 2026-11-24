import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, Calendar, Download, Flame, Loader2, Sparkles, X } from 'lucide-react';
import type { Book, ReadingProgress } from '@/types';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { type ReaderActivityReport, formatReadingDuration } from '@/lib/readingStreak';
import {
  type WrappedPeriod,
  computeWrappedSummary,
  exportWrappedPosterPng,
} from '@/lib/wrappedPosterCanvas';

export interface ReadingWrappedModalProps {
  open: boolean;
  books: readonly Book[];
  progress: Readonly<Record<string, ReadingProgress>>;
  activity: ReaderActivityReport | null;
  shelfCovers?: Readonly<Record<string, string>>;
  completedBooks: number;
  readPages: number;
  readerLevel: number;
  onClose: () => void;
}

const PERIOD_TABS: Array<{ id: WrappedPeriod; label: string }> = [
  { id: 'month', label: 'Tháng này' },
  { id: 'quarter', label: '90 ngày' },
  { id: 'year', label: 'Năm nay' },
];

export function ReadingWrappedModal({
  open,
  books,
  progress,
  activity,
  shelfCovers,
  completedBooks,
  readPages,
  readerLevel,
  onClose,
}: ReadingWrappedModalProps) {
  const [period, setPeriod] = useState<WrappedPeriod>('year');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, open]);

  const summary = useMemo(
    () =>
      computeWrappedSummary({
        period,
        books,
        progress,
        activity,
        shelfCovers,
        completedBooks,
        readPages,
        readerLevel,
      }),
    [activity, books, completedBooks, period, progress, readPages, readerLevel, shelfCovers],
  );

  if (!open || typeof document === 'undefined') return null;

  const maxMonthHours = Math.max(1, ...summary.monthlyHours.map((m) => m.hours));

  const handleExportPng = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportWrappedPosterPng(summary);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Không thể xuất ảnh tổng kết.');
    } finally {
      setExporting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ofu's Library Wrapped — Tổng kết đọc sách"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 z-[72] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-in flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0d111b] text-slate-100 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-amber-200">
                Ofu&apos;s Library Wrapped
              </h2>
              <p className="text-xs text-slate-400">{summary.periodLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-0.5">
              {PERIOD_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPeriod(t.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    period === t.id
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng bảng Wrapped"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[11px] text-slate-400">Thời lượng đọc</p>
              <p className="mt-1 font-display text-lg font-bold text-amber-300">
                {formatReadingDuration(summary.readingSeconds, true)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Calendar className="h-3 w-3 text-sky-400" />
                Ngày tích cực
              </p>
              <p className="mt-1 font-display text-lg font-bold text-white">
                {summary.activeDays} ngày
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Flame className="h-3 w-3 text-orange-400" />
                Chuỗi kỷ lục
              </p>
              <p className="mt-1 font-display text-lg font-bold text-white">
                {summary.longestStreakDays} ngày
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Award className="h-3 w-3 text-emerald-400" />
                Hoàn thành kỳ
              </p>
              <p className="mt-1 font-display text-lg font-bold text-white">
                {summary.completedBooks} cuốn
              </p>
              {summary.totalCompletedBooks > summary.completedBooks && (
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Tổng kho: {summary.totalCompletedBooks} cuốn
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Bộ truyện đồng hành nhiều nhất
            </p>
            {summary.topShelves.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                Chưa có thời lượng đọc theo bộ truyện trong khoảng thời gian này.
              </p>
            ) : (
              <ol className="mt-3 space-y-2.5">
                {summary.topShelves.map((sh, i) => (
                  <li
                    key={sh.shelfName}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-semibold text-white">
                        <span className="mr-1.5 text-amber-400">#{i + 1}</span>
                        {sh.shelfName}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {sh.author} · Xong {sh.completedCount}/{sh.totalVolumes} tập kỳ này
                      </p>
                    </div>
                    <span
                      title="Thời lượng đọc tích luỹ trên các tập hoạt động trong kỳ"
                      className="shrink-0 rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-300"
                    >
                      tích luỹ {formatReadingDuration(sh.readingSeconds, true)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {period === 'year' && summary.monthlyHours.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-300">
                Nhịp độ đọc 12 tháng trong năm (giờ)
              </p>
              <div className="grid grid-cols-12 items-end gap-1.5 h-24">
                {summary.monthlyHours.map((m) => {
                  const pct = m.hours > 0 ? Math.max(12, Math.round((m.hours / maxMonthHours) * 100)) : 4;
                  return (
                    <div key={m.label} className="flex h-full flex-col items-center justify-end gap-1">
                      <div
                        title={`${m.label}: ${m.hours} giờ`}
                        className={`w-full rounded-t-md transition-all ${
                          m.hours > 0 ? 'bg-amber-400/85' : 'bg-white/10'
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                      <span className="text-[10px] tabular-nums text-slate-400">{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {exportError && <p className="text-xs text-red-400">{exportError}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-5 py-3.5">
          <span className="text-xs text-slate-400">
            Tích luỹ toàn kho · LV.{summary.readerLevel} · ~{summary.readPages.toLocaleString('vi-VN')} trang đã đọc
          </span>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExportPng()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span>Tải ảnh Poster PNG</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
