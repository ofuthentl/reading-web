import type { Book, ReadingProgress } from '@/types';
import { fetchCoverBlobCached } from '@/lib/api';
import { getDisplayAuthor } from '@/lib/bookMetadata';
import {
  type ReaderActivityReport,
  computeStreakFromDays,
  formatReadingDuration,
} from '@/lib/readingStreak';
import { toShelfPrefKey } from '@/lib/shelfPrefs';
import { pickShelfCoverBook } from '@/lib/shelfSummary';

export type WrappedPeriod = 'month' | 'quarter' | 'year';

const VN_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

export interface WrappedTopShelfSummary {
  shelfName: string;
  author: string;
  readingSeconds: number;
  completedCount: number;
  totalVolumes: number;
  coverBook: Book | null;
}

export interface WrappedComputedSummary {
  period: WrappedPeriod;
  periodLabel: string;
  readingSeconds: number;
  activeDays: number;
  longestStreakDays: number;
  currentStreakDays: number;
  completedBooks: number;
  totalCompletedBooks: number;
  readPages: number;
  readerLevel: number;
  topShelves: WrappedTopShelfSummary[];
  monthlyHours: Array<{ label: string; hours: number }>;
}

function resolveVnPeriodMeta(
  period: WrappedPeriod,
  nowMs: number,
): { periodLabel: string; cutoffMs: number; currentMonthPrefix: string; currentYearPrefix: string } {
  const vnDate = new Date(nowMs + VN_OFFSET_MS);
  const year = vnDate.getUTCFullYear();
  const month = vnDate.getUTCMonth() + 1;
  const day = vnDate.getUTCDate();
  const currentMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const currentYearPrefix = String(year);

  if (period === 'month') {
    return {
      periodLabel: `Tháng ${String(month).padStart(2, '0')}/${year}`,
      cutoffMs: Date.UTC(year, month - 1, 1) - VN_OFFSET_MS,
      currentMonthPrefix,
      currentYearPrefix,
    };
  }
  if (period === 'quarter') {
    return {
      periodLabel: '90 ngày gần nhất',
      cutoffMs: Date.UTC(year, month - 1, day) - 89 * DAY_MS - VN_OFFSET_MS,
      currentMonthPrefix,
      currentYearPrefix,
    };
  }
  return {
    periodLabel: `Năm ${year}`,
    cutoffMs: Date.UTC(year, 0, 1) - VN_OFFSET_MS,
    currentMonthPrefix,
    currentYearPrefix,
  };
}

export function computeWrappedSummary(options: {
  period: WrappedPeriod;
  books: readonly Book[];
  progress: Readonly<Record<string, ReadingProgress>>;
  activity: ReaderActivityReport | null;
  shelfCovers?: Readonly<Record<string, string>>;
  completedBooks: number;
  readPages: number;
  readerLevel: number;
  nowMs?: number;
}): WrappedComputedSummary {
  const {
    period,
    books,
    progress,
    activity,
    shelfCovers,
    completedBooks: totalCompletedBooks,
    readPages,
    readerLevel,
    nowMs = Date.now(),
  } = options;

  const { periodLabel, cutoffMs, currentMonthPrefix, currentYearPrefix } = resolveVnPeriodMeta(
    period,
    nowMs,
  );

  const readingSeconds =
    period === 'month'
      ? (activity?.monthReadingSeconds ?? 0)
      : period === 'quarter'
        ? (activity?.readingSeconds90d ?? 0)
        : (activity?.yearReadingSeconds ?? activity?.totalReadingSeconds ?? 0);

  const activeDays =
    period === 'month'
      ? (activity?.monthActiveDays ?? 0)
      : period === 'quarter'
        ? (activity?.activeDays90d ?? 0)
        : (activity?.yearActiveDays ?? activity?.activeDays90d ?? 0);

  const fallbackMonthStreak = activity
    ? computeStreakFromDays(activity.days.filter((d) => d.dayKey.startsWith(currentMonthPrefix)))
        .longestStreakDays
    : 0;
  const fallbackYearStreak = activity
    ? computeStreakFromDays(activity.days.filter((d) => d.dayKey.startsWith(currentYearPrefix)))
        .longestStreakDays
    : 0;

  const longestStreakDays =
    period === 'month'
      ? (activity?.monthLongestStreakDays ?? fallbackMonthStreak)
      : period === 'quarter'
        ? (activity?.longestStreakDays ?? 0)
        : (activity?.yearLongestStreakDays ??
          Math.max(activity?.longestStreakDays ?? 0, fallbackYearStreak));

  let periodCompletedBooks = 0;
  const shelfBuckets = new Map<
    string,
    {
      shelfName: string;
      shelfKey: string;
      author: string;
      readingSeconds: number;
      completedCount: number;
      books: Book[];
    }
  >();

  for (const book of books) {
    const shelfName =
      (book.shelf || 'Kho chưa phân loại').normalize('NFC').trim() || 'Kho chưa phân loại';
    const key = toShelfPrefKey(shelfName);
    let bucket = shelfBuckets.get(key);
    if (!bucket) {
      bucket = {
        shelfName,
        shelfKey: key,
        author: getDisplayAuthor(book.author, book.title),
        readingSeconds: 0,
        completedCount: 0,
        books: [],
      };
      shelfBuckets.set(key, bucket);
    }
    bucket.books.push(book);

    const prog = progress[book.id];
    if (prog && prog.updatedAt >= cutoffMs) {
      bucket.readingSeconds += Math.max(0, Math.floor(prog.readingSeconds ?? 0));
      if (prog.completed) {
        bucket.completedCount += 1;
        periodCompletedBooks += 1;
      }
    }
  }

  const topShelves: WrappedTopShelfSummary[] = Array.from(shelfBuckets.values())
    .filter((s) => s.readingSeconds > 0 || s.completedCount > 0)
    .sort((a, b) => b.readingSeconds - a.readingSeconds || b.completedCount - a.completedCount)
    .slice(0, 3)
    .map((bucket) => {
      const preferredId = shelfCovers?.[bucket.shelfKey] ?? null;
      const coverBook = pickShelfCoverBook(
        { key: bucket.shelfKey, name: bucket.shelfName, books: bucket.books },
        preferredId,
      );
      return {
        shelfName: bucket.shelfName,
        author: bucket.author,
        readingSeconds: bucket.readingSeconds,
        completedCount: bucket.completedCount,
        totalVolumes: bucket.books.length,
        coverBook: coverBook?.cover_key ? coverBook : null,
      };
    });

  const monthlyHours = (activity?.monthlyBreakdown ?? []).map((pt, idx) => ({
    label: `T${idx + 1}`,
    hours: Math.round((pt.readingSeconds / 3600) * 10) / 10,
  }));

  return {
    period,
    periodLabel,
    readingSeconds,
    activeDays,
    longestStreakDays,
    currentStreakDays: activity?.currentStreakDays ?? 0,
    completedBooks: periodCompletedBooks,
    totalCompletedBooks,
    readPages,
    readerLevel,
    topShelves,
    monthlyHours,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCoverImageCropped(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const srcRatio = bitmap.width / Math.max(1, bitmap.height);
  const dstRatio = dw / Math.max(1, dh);
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (srcRatio > dstRatio) {
    sw = bitmap.height * dstRatio;
    sx = (bitmap.width - sw) / 2;
  } else {
    sh = bitmap.width / dstRatio;
    sy = (bitmap.height - sh) / 2;
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
}

function truncateCanvasLine(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

async function ensureWrappedFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const sample = 'Việt Nam Tổng kết Hành trình Đọc ệữởắồỷ 0123456789';
  await Promise.allSettled([
    document.fonts.load('400 24px "Be Vietnam Pro"', sample),
    document.fonts.load('600 24px "Be Vietnam Pro"', sample),
    document.fonts.load('600 24px "Literata"', sample),
    document.fonts.load('700 46px "Literata"', sample),
  ]);
  await document.fonts.ready.catch(() => undefined);
}

/**
 * Kết xuất thẻ poster `Ofu's Library Wrapped` (`1080×1350` PNG) bằng Canvas 2D thuần (0 CDN),
 * chủ động tải đúng font weight `400/600/700`, vẽ bìa `object-cover` không méo tỉ lệ,
 * tự giải phóng `ImageBitmap` và giữ ObjectURL đủ lâu (`45s`) cho Safari iOS tải ổn định.
 */
export async function exportWrappedPosterPng(summary: WrappedComputedSummary): Promise<void> {
  await ensureWrappedFontsLoaded();

  const width = 1080;
  const height = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không thể khởi tạo khung vẽ Canvas 2D.');

  let coverBitmap: ImageBitmap | null = null;
  const leadBook = summary.topShelves[0]?.coverBook ?? null;
  if (leadBook?.cover_key && typeof createImageBitmap === 'function') {
    try {
      const blob = await fetchCoverBlobCached(leadBook.cover_key);
      if (blob) coverBitmap = await createImageBitmap(blob);
    } catch {
      coverBitmap = null;
    }
  }

  try {
    // 1. Nền đêm ánh hổ phách đặc trưng của Ofu's Library
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#0b0e16');
    bg.addColorStop(0.55, '#131826');
    bg.addColorStop(1, '#1c1512');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(860, 220, 40, 860, 220, 560);
    glow.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
    glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Khung viền đôi cổ điển
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.28)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 44, 44, width - 88, height - 88, 34);
    ctx.stroke();

    // 2. Tiêu đề thương hiệu
    ctx.fillStyle = '#fbbf24';
    ctx.font = '600 24px "Be Vietnam Pro", sans-serif';
    ctx.fillText("OFU'S LIBRARY · WRAPPED", 92, 118);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 62px "Literata", Georgia, serif';
    ctx.fillText('Tổng kết Hành trình Đọc', 92, 196);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 28px "Be Vietnam Pro", sans-serif';
    ctx.fillText(`${summary.periodLabel}  ·  Độc giả LV.${summary.readerLevel}`, 92, 246);

    // 3. 4 ô chỉ số lớn theo kỳ
    const stats = [
      { label: 'THỜI LƯỢNG ĐỌC', value: formatReadingDuration(summary.readingSeconds, true) },
      { label: 'NGÀY ĐỌC TÍCH CỰC', value: `${summary.activeDays} ngày` },
      { label: 'CHUỖI KỶ LỤC KỲ', value: `${summary.longestStreakDays} ngày` },
      { label: 'HOÀN THÀNH TRONG KỲ', value: `${summary.completedBooks} cuốn` },
    ];
    stats.forEach((st, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = 92 + col * 458;
      const by = 296 + row * 176;
      drawRoundedRect(ctx, bx, by, 438, 154, 24);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 20px "Be Vietnam Pro", sans-serif';
      ctx.fillText(st.label, bx + 28, by + 48);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 46px "Literata", Georgia, serif';
      ctx.fillText(st.value, bx + 28, by + 114);
    });

    // 4. Bộ truyện gắn bó nhất (hoạt động trong kỳ, hiển thị rõ thời lượng tích luỹ)
    drawRoundedRect(ctx, 92, 676, width - 184, 430, 28);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.24)';
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = '600 22px "Be Vietnam Pro", sans-serif';
    ctx.fillText('BỘ TRUYỆN ĐỒNG HÀNH NHIỀU NHẤT', 128, 730);

    let textStartX = 128;
    if (coverBitmap) {
      const cw = 186;
      const ch = 266;
      const cx = 128;
      const cy = 768;
      ctx.save();
      drawRoundedRect(ctx, cx, cy, cw, ch, 16);
      ctx.clip();
      drawCoverImageCropped(ctx, coverBitmap, cx, cy, cw, ch);
      ctx.restore();
      textStartX = 344;
    }

    if (summary.topShelves.length === 0) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '400 28px "Be Vietnam Pro", sans-serif';
      ctx.fillText('Chưa có dữ liệu bộ truyện trong kỳ này.', textStartX, 830);
    } else {
      summary.topShelves.forEach((sh, idx) => {
        const ry = 795 + idx * 94;
        const maxW = width - 140 - textStartX;
        ctx.fillStyle = idx === 0 ? '#fde68a' : '#f1f5f9';
        ctx.font = `700 ${idx === 0 ? 32 : 26}px "Literata", Georgia, serif`;
        ctx.fillText(truncateCanvasLine(ctx, `#${idx + 1}  ${sh.shelfName}`, maxW), textStartX, ry);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 21px "Be Vietnam Pro", sans-serif';
        const sub = `${sh.author}  ·  tích luỹ ${formatReadingDuration(sh.readingSeconds, true)}  ·  ${sh.completedCount}/${sh.totalVolumes} tập kỳ này`;
        ctx.fillText(truncateCanvasLine(ctx, sub, maxW), textStartX, ry + 34);
      });
    }

    // 5. Chân trang — minh bạch số liệu tích luỹ toàn kho
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 22px "Be Vietnam Pro", sans-serif';
    ctx.fillText(
      `Tích luỹ toàn kho: ~${summary.readPages.toLocaleString('vi-VN')} trang đã đọc  ·  ${summary.totalCompletedBooks} cuốn hoàn thành`,
      92,
      1188,
    );
    ctx.fillStyle = '#fbbf24';
    ctx.font = '600 24px "Literata", Georgia, serif';
    ctx.fillText('ofu.lol — Thư viện Light Novel cá nhân', 92, 1244);
  } finally {
    coverBitmap?.close();
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Không thể xuất ảnh PNG.');

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = `ofus-library-wrapped-${summary.period}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 45_000);
  }
}
