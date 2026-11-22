import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Fingerprint, Loader2, RefreshCw, Shield, ShieldAlert, Square, Users, X,
} from 'lucide-react';
import type { Book, StorageStats } from '@/types';
import { AdminDiscordGuestsPanel } from '@/components/AdminDiscordGuestsPanel';
import { fetchBookBlobCached, formatBytes, isCloudMode } from '@/lib/api';
import {
  type DiscordGuestRecord, type ForensicSuspectItem,
  fetchAdminDiscordGuests, runAdminForensicWatermarkCheck, setAdminDiscordGuestBan,
} from '@/lib/guestCrypto';
import { buildAndUploadGuestPack } from '@/lib/guestPackBuilder';
import type { ToastType } from '@/hooks/useToast';

type ProtectionTab = 'sync' | 'forensic' | 'guests';

interface AdminProtectionModalProps {
  open: boolean;
  books: Book[];
  onClose: () => void;
  onBookPackSynced: (bookId: string, storage?: StorageStats) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export function AdminProtectionModal({
  open, books, onClose, onBookPackSynced, onApiError, onNotify,
}: AdminProtectionModalProps) {
  const [activeTab, setActiveTab] = useState<ProtectionTab>('sync');

  // State đồng bộ gói đọc khách cho sách EPUB/DOCX
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    done: number;
    total: number;
    currentTitle: string;
    stepLabel?: string;
  } | null>(null);
  const stopSyncRef = useRef(false);
  const syncAbortRef = useRef<AbortController | null>(null);

  // State truy vết rò rỉ văn bản 32-bit
  const [sampleText, setSampleText] = useState('');
  const [checkingForensic, setCheckingForensic] = useState(false);
  const [forensicReport, setForensicReport] = useState<{
    totalSlots: number;
    toneSlots: number;
    results: ForensicSuspectItem[];
  } | null>(null);

  // State quản lý danh sách khách Discord
  const [guests, setGuests] = useState<DiscordGuestRecord[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const eligibleBooks = useMemo(
    () => books.filter((b) => b.file_type === 'epub' || b.file_type === 'docx'),
    [books],
  );
  const missingBooks = useMemo(
    () => eligibleBooks.filter((b) => !b.guest_ready),
    [eligibleBooks],
  );
  const readyCount = eligibleBooks.length - missingBooks.length;

  const loadGuests = useCallback(async () => {
    if (!isCloudMode) return;
    setLoadingGuests(true);
    try {
      const list = await fetchAdminDiscordGuests();
      setGuests(list);
    } catch (err) {
      onApiError(err, 'Không thể tải danh sách khách Discord.');
    } finally {
      setLoadingGuests(false);
    }
  }, [onApiError]);

  useEffect(() => {
    if (open && activeTab === 'guests') {
      void loadGuests();
    }
  }, [activeTab, loadGuests, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !syncing) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, syncing]);

  if (!open) return null;

  const handleBatchSync = async (targets: Book[]) => {
    if (targets.length === 0 || syncing) return;
    if (!isCloudMode) {
      onNotify('Đồng bộ gói bảo mật chỉ hoạt động khi kết nối Cloudflare Worker.', 'info');
      return;
    }

    stopSyncRef.current = false;
    setSyncing(true);
    setSyncProgress({ done: 0, total: targets.length, currentTitle: targets[0].title });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targets.length; i += 1) {
      if (stopSyncRef.current) break;
      const target = targets[i];
      const controller = new AbortController();
      syncAbortRef.current = controller;
      setSyncProgress({
        done: i,
        total: targets.length,
        currentTitle: target.title,
        stepLabel: `Đang tải tệp (${formatBytes(target.file_size)})...`,
      });
      try {
        const { blob } = await fetchBookBlobCached(target, {
          cacheOnFetch: false,
          signal: controller.signal,
        });
        if (stopSyncRef.current) break;
        setSyncProgress({
          done: i,
          total: targets.length,
          currentTitle: target.title,
          stepLabel: 'Đang nén & tải gói bảo mật...',
        });
        const res = await buildAndUploadGuestPack(blob, target);
        onBookPackSynced(target.id, res.storage);
        successCount += 1;
      } catch (err) {
        if (stopSyncRef.current) break;
        failCount += 1;
        console.warn(`Lỗi tạo gói khách cho "${target.title}":`, err);
      }
    }
    syncAbortRef.current = null;

    setSyncing(false);
    setSyncProgress(null);
    if (successCount > 0) {
      onNotify(
        failCount > 0
          ? `Đã bật bảo mật cho ${successCount} sách (${failCount} sách lỗi).`
          : `Đã bật bảo mật chế độ khách cho ${successCount} sách!`,
        failCount > 0 ? 'warning' : 'success',
      );
    } else if (failCount > 0) {
      onNotify('Không thể đồng bộ gói bảo mật. Vui lòng thử lại.', 'error');
    }
  };

  const handleForensicScan = async () => {
    const clean = sampleText.trim();
    if (clean.length < 80) {
      onNotify('Hãy dán đoạn văn dài ít nhất 80 ký tự (tốt nhất là nửa chương hoặc cả chương).', 'warning');
      return;
    }
    setCheckingForensic(true);
    try {
      const report = await runAdminForensicWatermarkCheck(clean);
      setForensicReport(report);
    } catch (err) {
      onApiError(err, 'Không thể quét dấu vân tay văn bản.');
    } finally {
      setCheckingForensic(false);
    }
  };

  const handleToggleBan = async (userId: string, nextBanned: boolean, username: string) => {
    setTogglingUserId(userId);
    try {
      await setAdminDiscordGuestBan(
        userId,
        nextBanned,
        nextBanned ? 'Khoá bởi Quản trị viên' : undefined,
      );
      setGuests((prev) =>
        prev.map((g) =>
          g.discordUserId === userId
            ? { ...g, isBanned: nextBanned, sessionExpiresAt: nextBanned ? null : g.sessionExpiresAt }
            : g,
        ),
      );
      onNotify(
        nextBanned
          ? `Đã khoá quyền truy cập của ${username} (#${userId.slice(-4)}).`
          : `Đã mở khoá cho ${username}.`,
        nextBanned ? 'warning' : 'success',
      );
    } catch (err) {
      onApiError(err, 'Không thể cập nhật trạng thái khoá.');
    } finally {
      setTogglingUserId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!syncing) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bảo mật nội dung chế độ khách"
        onClick={(e) => e.stopPropagation()}
        className="moonlit-card fade-in flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl dark:border-line-strong/70"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold">Bảo mật Nội dung Khách (D-028)</h2>
              <p className="text-xs text-ink-muted">
                Chống tải file gốc, đọc Canvas nhiễu nền & truy vết thuỷ vân Discord 32-bit
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={syncing}
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted transition hover:bg-subtle hover:text-ink disabled:opacity-40"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Thanh chuyển Tab */}
        <div className="grid grid-cols-3 gap-1.5 border-b border-line bg-canvas/70 px-5 py-2.5">
          {(
            [
              { id: 'sync', label: `Gói bảo mật (${readyCount}/${eligibleBooks.length})`, Icon: Shield },
              { id: 'forensic', label: 'Truy vết rò rỉ', Icon: Fingerprint },
              { id: 'guests', label: 'Khách Discord', Icon: Users },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                activeTab === id
                  ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong/80'
                  : 'text-ink-muted hover:bg-subtle/70 hover:text-ink'
              }`}
            >
              <Icon className="h-3.5 w-3.5 text-accent" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Nội dung từng Tab */}
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
          {activeTab === 'sync' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-canvas p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      Đã chuẩn hoá {readyCount} / {eligibleBooks.length} sách EPUB &amp; DOCX
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Sách tải lên mới sẽ tự động tạo gói bảo mật (~0.5% dung lượng, 0 byte nhân bản
                      ảnh). Với các sách tải lên từ trước, bấm nút bên dưới để đồng bộ 1 lần.
                    </p>
                  </div>
                  {missingBooks.length === 0 && eligibleBooks.length > 0 && (
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                  )}
                </div>

                {syncProgress && (
                  <div className="mt-4 space-y-2 rounded-lg border border-line bg-surface p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium">
                        {syncProgress.currentTitle}
                        {syncProgress.stepLabel ? ` — ${syncProgress.stepLabel}` : ''}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-muted">
                        {syncProgress.done} / {syncProgress.total}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{
                          width: `${Math.round((syncProgress.done / Math.max(1, syncProgress.total)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  {syncing ? (
                    <button
                      type="button"
                      onClick={() => {
                        stopSyncRef.current = true;
                        syncAbortRef.current?.abort();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-300"
                    >
                      <Square className="h-3.5 w-3.5" />
                      Dừng đồng bộ
                    </button>
                  ) : missingBooks.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void handleBatchSync(missingBooks)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Đồng bộ {missingBooks.length} sách chưa có gói
                    </button>
                  ) : (
                    eligibleBooks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleBatchSync(eligibleBooks)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Tạo lại toàn bộ gói ({eligibleBooks.length})
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'forensic' && (
            <div className="space-y-4">
              <p className="text-xs text-ink-muted">
                Dán đoạn văn hoặc chương truyện nghi bị rò rỉ ra ngoài (kể cả văn bản `.txt`/`.epub`
                đã qua OCR). Hệ thống sẽ trích xuất chữ ký 32-bit trên dấu thanh/dấu câu tiếng Việt để
                đối chiếu từng tài khoản Discord.
              </p>
              <textarea
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                rows={6}
                placeholder="Dán nội dung chương bị rò rỉ tại đây (khuyến nghị >= 500 chữ để đạt độ tin cậy cao nhất)..."
                className="w-full rounded-xl border border-line bg-canvas p-3 text-xs leading-relaxed text-ink outline-none focus:border-accent"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-ink-muted">
                  Độ dài mẫu: {sampleText.trim().length} ký tự
                </span>
                <button
                  type="button"
                  disabled={checkingForensic}
                  onClick={() => void handleForensicScan()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
                >
                  {checkingForensic ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Fingerprint className="h-3.5 w-3.5" />
                  )}
                  Quét dấu vân tay 32-bit
                </button>
              </div>

              {forensicReport && (
                <div className="space-y-2.5 rounded-xl border border-line bg-canvas p-3.5">
                  <p className="text-xs font-medium">
                    Đọc được <span className="font-bold text-accent">{forensicReport.totalSlots}</span>{' '}
                    điểm mang dấu ({forensicReport.toneSlots} điểm dấu thanh nguyên âm đôi).
                  </p>
                  {forensicReport.totalSlots < 10 ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Đoạn văn còn ngắn (dưới 10 điểm dấu). Hãy dán dài hơn (1 chương đầy đủ thường có
                      50–120 điểm dấu) để kết luận chính xác tuyệt đối.
                    </p>
                  ) : forensicReport.results.length === 0 ? (
                    <p className="text-xs text-ink-muted">Chưa có lịch sử khách Discord nào trên máy chủ.</p>
                  ) : (
                    <div className="space-y-2">
                      {forensicReport.results.slice(0, 5).map((item) => {
                        const isHighConfidence =
                          forensicReport.totalSlots >= 15 && item.scorePercent >= 78;
                        return (
                          <div
                            key={item.discordUserId}
                            className={`flex items-center justify-between gap-3 rounded-xl border p-2.5 text-xs ${
                              isHighConfidence
                                ? 'border-red-500/45 bg-red-500/10'
                                : 'border-line bg-surface'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 font-semibold">
                                {isHighConfidence && (
                                  <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" />
                                )}
                                <span className="truncate">{item.discordUsername}</span>
                                <span className="font-mono text-[11px] font-normal text-ink-muted">
                                  ({item.discordUserId})
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-ink-muted">
                                Khớp tổng: {item.matchedSlots}/{item.totalSlots} ({item.matchPercent}%)
                                {item.toneTotalSlots > 0 &&
                                  ` · Kênh dấu thanh chống OCR: ${item.toneMatchedSlots}/${item.toneTotalSlots} (${item.toneMatchPercent}%)`}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={togglingUserId === item.discordUserId}
                              onClick={() =>
                                void handleToggleBan(
                                  item.discordUserId,
                                  true,
                                  item.discordUsername,
                                )
                              }
                              className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-500/25 dark:text-red-300"
                            >
                              Khoá ngay
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'guests' && (
            <AdminDiscordGuestsPanel
              guests={guests}
              loading={loadingGuests}
              togglingUserId={togglingUserId}
              onRefresh={() => void loadGuests()}
              onToggleBan={(userId, nextBanned, username) =>
                void handleToggleBan(userId, nextBanned, username)
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
