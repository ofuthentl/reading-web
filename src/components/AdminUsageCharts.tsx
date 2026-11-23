import { useMemo, useState } from 'react';
import { HardDrive, ShieldAlert } from 'lucide-react';
import { formatBytes } from '@/lib/api';
import type { AdminUsageDailyPoint, AdminUsageReport } from '@/lib/usageApi';

type ChartMetricTab = 'reads' | 'readers' | 'auth';

function formatShortDay(dayKey: string): string {
  const parts = dayKey.split('-');
  if (parts.length !== 3) return dayKey;
  return `${parts[2]}/${parts[1]}`;
}

export interface DailyActivityChartProps {
  series: readonly AdminUsageDailyPoint[];
  days: number;
}

export function DailyActivityChart({ series, days }: DailyActivityChartProps) {
  const [tab, setTab] = useState<ChartMetricTab>('reads');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const selectedPoint =
    activeIndex !== null && series[activeIndex]
      ? series[activeIndex]
      : series[series.length - 1] ?? null;

  const chartData = useMemo(() => {
    return series.map((d) => {
      if (tab === 'reads') {
        return {
          dayKey: d.dayKey,
          primary: d.guestChapterReads,
          secondary: d.ownerProgressUpdates,
          total: d.guestChapterReads + d.ownerProgressUpdates,
        };
      }
      if (tab === 'readers') {
        return {
          dayKey: d.dayKey,
          primary: d.uniqueReaders,
          secondary: d.guestReaders,
          total: d.uniqueReaders,
        };
      }
      return {
        dayKey: d.dayKey,
        primary: d.discordKeysIssued + d.guestLogins + d.ownerLogins,
        secondary: d.loginFailures + d.rateLimitHits,
        total: d.discordKeysIssued + d.guestLogins + d.ownerLogins + d.loginFailures + d.rateLimitHits,
      };
    });
  }, [series, tab]);

  const maxVal = useMemo(() => {
    let m = 1;
    for (const item of chartData) {
      if (item.primary > m) m = item.primary;
      if (item.secondary > m) m = item.secondary;
      if (tab === 'reads' && item.total > m) m = item.total;
    }
    return m;
  }, [chartData, tab]);

  const svgWidth = 640;
  const svgHeight = 196;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 14;
  const padBottom = 26;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;
  const count = Math.max(1, chartData.length);
  const slotW = plotW / count;
  const barW = Math.max(5, Math.min(22, slotW * 0.62));
  const labelEvery = count <= 7 ? 1 : count <= 14 ? 2 : 5;

  return (
    <section className="moonlit-card flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/60">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="font-display text-base font-semibold text-ink sm:text-lg">
            Biểu đồ hoạt động {days} ngày (UTC+7)
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Số liệu gộp theo ngày · Di chuột hoặc chạm vào cột để xem chi tiết
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-line bg-canvas p-1 text-xs">
          {(
            [
              ['reads', 'Lượt đọc'],
              ['readers', 'Độc giả (DAU)'],
              ['auth', 'Cổng & 429'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                tab === id
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Dải số liệu chi tiết ngày đang chọn (luôn vừa vặn cả PC lẫn Mobile) */}
      {selectedPoint && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line/80 bg-canvas/80 px-3 py-2 text-xs">
          <span className="font-semibold text-ink">
            Ngày {formatShortDay(selectedPoint.dayKey)}
          </span>
          {tab === 'reads' && (
            <>
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className="h-2 w-2 rounded-full bg-crimson-accent" />
                Khách mở chương:{' '}
                <strong className="tabular-nums text-ink">{selectedPoint.guestChapterReads}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className="h-2 w-2 rounded-full bg-accent" />
                Admin cập nhật tiến độ:{' '}
                <strong className="tabular-nums text-ink">
                  {selectedPoint.ownerProgressUpdates}
                </strong>
              </span>
              <span className="text-ink-muted">
                Tìm kiếm khách:{' '}
                <strong className="tabular-nums text-ink">{selectedPoint.guestSearches}</strong>
              </span>
            </>
          )}
          {tab === 'readers' && (
            <>
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className="h-2 w-2 rounded-full bg-accent" />
                Tổng độc giả duy nhất:{' '}
                <strong className="tabular-nums text-ink">{selectedPoint.uniqueReaders}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className="h-2 w-2 rounded-full bg-crimson-accent" />
                Trong đó khách Discord:{' '}
                <strong className="tabular-nums text-ink">{selectedPoint.guestReaders}</strong>
              </span>
            </>
          )}
          {tab === 'auth' && (
            <>
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className="h-2 w-2 rounded-full bg-accent" />
                Cấp key Discord:{' '}
                <strong className="tabular-nums text-ink">{selectedPoint.discordKeysIssued}</strong>
              </span>
              <span className="text-ink-muted">
                Đăng nhập (Khách / Admin):{' '}
                <strong className="tabular-nums text-ink">
                  {selectedPoint.guestLogins} / {selectedPoint.ownerLogins}
                </strong>
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Sai mã / Chạm 429:{' '}
                <strong className="tabular-nums text-ink">
                  {selectedPoint.loginFailures} / {selectedPoint.rateLimitHits}
                </strong>
              </span>
            </>
          )}
        </div>
      )}

      {/* Biểu đồ SVG thuần 0 CDN */}
      <div className="mt-3 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-48 w-full select-none sm:h-52"
          role="img"
          aria-label={`Biểu đồ thống kê ${days} ngày`}
        >
          {/* Đường lưới ngang (0%, 50%, 100%) */}
          {[0, 0.5, 1].map((ratio) => {
            const y = padTop + plotH * (1 - ratio);
            const val = Math.round(maxVal * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={ratio === 0 ? 0.22 : 0.1}
                  strokeDasharray={ratio === 0 ? undefined : '3 4'}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-ink-faint text-[10px] tabular-nums"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {chartData.map((d, idx) => {
            const cx = padLeft + idx * slotW + slotW / 2;
            const isSelected =
              activeIndex !== null ? activeIndex === idx : idx === chartData.length - 1;
            const showLabel = idx % labelEvery === 0 || idx === chartData.length - 1;

            const primaryH = (d.primary / maxVal) * plotH;
            const secondaryH = (d.secondary / maxVal) * plotH;

            return (
              <g
                key={d.dayKey}
                className="cursor-pointer"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
              >
                {/* Vùng chạm rộng theo cột */}
                <rect
                  x={padLeft + idx * slotW}
                  y={padTop}
                  width={slotW}
                  height={plotH}
                  fill="currentColor"
                  fillOpacity={isSelected ? 0.06 : 0}
                  rx={4}
                />

                {tab === 'reads' ? (
                  <>
                    {/* Cột xếp chồng: Admin tiến độ (trên) + Khách mở chương (dưới) */}
                    {d.primary > 0 && (
                      <rect
                        x={cx - barW / 2}
                        y={padTop + plotH - primaryH}
                        width={barW}
                        height={Math.max(2, primaryH)}
                        rx={3}
                        className="fill-crimson-accent transition-opacity"
                        opacity={isSelected ? 1 : 0.78}
                      />
                    )}
                    {d.secondary > 0 && (
                      <rect
                        x={cx - barW / 2}
                        y={padTop + plotH - primaryH - secondaryH}
                        width={barW}
                        height={Math.max(2, secondaryH)}
                        rx={3}
                        className="fill-accent transition-opacity"
                        opacity={isSelected ? 0.95 : 0.62}
                      />
                    )}
                  </>
                ) : tab === 'readers' ? (
                  <>
                    {d.primary > 0 && (
                      <rect
                        x={cx - barW / 2}
                        y={padTop + plotH - primaryH}
                        width={barW}
                        height={Math.max(3, primaryH)}
                        rx={3}
                        className="fill-accent transition-opacity"
                        opacity={isSelected ? 0.95 : 0.72}
                      />
                    )}
                    {d.secondary > 0 && (
                      <rect
                        x={cx - barW / 2}
                        y={padTop + plotH - secondaryH}
                        width={barW}
                        height={Math.max(3, secondaryH)}
                        rx={3}
                        className="fill-crimson-accent transition-opacity"
                        opacity={isSelected ? 1 : 0.85}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {d.primary > 0 && (
                      <rect
                        x={cx - barW / 2}
                        y={padTop + plotH - primaryH}
                        width={Math.max(3, barW * 0.56)}
                        height={Math.max(2, primaryH)}
                        rx={2.5}
                        className="fill-accent"
                        opacity={isSelected ? 1 : 0.78}
                      />
                    )}
                    {d.secondary > 0 && (
                      <rect
                        x={cx + barW * 0.08}
                        y={padTop + plotH - secondaryH}
                        width={Math.max(3, barW * 0.44)}
                        height={Math.max(2, secondaryH)}
                        rx={2.5}
                        className="fill-amber-500"
                        opacity={isSelected ? 1 : 0.82}
                      />
                    )}
                  </>
                )}

                {showLabel && (
                  <text
                    x={cx}
                    y={svgHeight - 8}
                    textAnchor="middle"
                    className={`text-[10px] tabular-nums ${
                      isSelected ? 'fill-ink font-semibold' : 'fill-ink-faint'
                    }`}
                  >
                    {formatShortDay(d.dayKey)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

export function StorageAndSecurityPanel({
  storage,
  security,
  overview,
}: Pick<AdminUsageReport, 'storage' | 'security' | 'overview'>) {
  const limit = Math.max(1, storage.limitBytes);
  const usedPct = Math.min(100, (storage.usedBytes / limit) * 100);
  const filePct = (storage.fileBytes / limit) * 100;
  const packPct = (storage.packBytes / limit) * 100;
  const coverPct = (storage.coverBytes / limit) * 100;
  const guestPackRatio =
    overview.totalBooks > 0
      ? Math.round((overview.guestReadyBooks / overview.totalBooks) * 100)
      : 100;

  return (
    <section className="moonlit-card flex flex-col justify-between gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5 dark:border-line-strong/60">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink">
            <HardDrive className="h-4 w-4 text-accent" />
            <span>Phân bổ R2 Free Tier</span>
          </h2>
          <span className="text-xs font-semibold tabular-nums text-ink">
            {usedPct.toFixed(1)}%
          </span>
        </div>

        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-subtle">
          <div
            className="h-full bg-crimson-accent transition-all"
            style={{ width: `${Math.min(100, filePct)}%` }}
            title={`File sách gốc: ${formatBytes(storage.fileBytes)}`}
          />
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${Math.min(100 - filePct, packPct)}%` }}
            title={`Gói bảo mật guest-packs: ${formatBytes(storage.packBytes)}`}
          />
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100 - filePct - packPct, coverPct)}%` }}
            title={`Ảnh bìa: ${formatBytes(storage.coverBytes)}`}
          />
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-crimson-accent" />
              File sách gốc ({overview.epubCount} EPUB · {overview.docxCount} DOCX)
            </span>
            <span className="font-medium tabular-nums text-ink">
              {formatBytes(storage.fileBytes)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Gói bảo mật khách ({guestPackRatio}%)
            </span>
            <span className="font-medium tabular-nums text-ink">
              {formatBytes(storage.packBytes)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Ảnh bìa nén
            </span>
            <span className="font-medium tabular-nums text-ink">
              {formatBytes(storage.coverBytes)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-line/70 pt-1.5">
            <span className="text-ink-muted">Còn trống / Hạn mức an toàn</span>
            <span className="font-semibold tabular-nums text-ink">
              {formatBytes(storage.remainingBytes)} / {formatBytes(storage.limitBytes)}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line/80 bg-canvas/80 p-3 text-xs">
        <p className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span>An toàn &amp; Chống lạm dụng</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5">
            <p className="text-ink-faint">Chạm giới hạn 429</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
              {security.recentRateLimitHits}
            </p>
          </div>
          <div className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5">
            <p className="text-ink-faint">Sai mật mã / key</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
              {security.recentLoginFailures}
            </p>
          </div>
          <div className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5">
            <p className="text-ink-faint">IP khoá tạm / Strikes</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
              {security.activeLockedIps} / {security.totalStrikes}
            </p>
          </div>
          <div className="rounded-lg border border-line/70 bg-surface px-2.5 py-1.5">
            <p className="text-ink-faint">Tài khoản bị khoá</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
              {security.bannedGuests}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
