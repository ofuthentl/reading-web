import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Fingerprint, Loader2, Shield, ShieldAlert, Users, X } from 'lucide-react';
import type { AuthSessionInfo, Book, StorageStats } from '@/types';
import { AdminDiscordGuestsPanel } from '@/components/AdminDiscordGuestsPanel';
import { AdminProtectionSyncTab } from '@/components/AdminProtectionSyncTab';
import { AdminRevokeSessionsAction } from '@/components/AdminRevokeSessionsAction';
import { ModalShell } from '@/components/ModalShell';
import { isAuthError, isCloudMode } from '@/lib/api';
import {
  type DiscordGuestRecord,
  type ForensicSuspectItem,
  fetchAdminDiscordGuests,
  runAdminForensicWatermarkCheck,
  setAdminDiscordGuestBan,
} from '@/lib/guestCrypto';
import type { ToastType } from '@/hooks/useToast';

type ProtectionTab = 'sync' | 'forensic' | 'guests';

export interface AdminProtectionModalProps {
  open: boolean;
  books: Book[];
  initialShelfKey?: string;
  initialBookId?: string;
  onClose: () => void;
  onBookPackSynced: (bookId: string, storage?: StorageStats) => void;
  onStorageSynced?: (storage: StorageStats) => void;
  onLogout?: () => void;
  onSessionReissued?: (nextSession: AuthSessionInfo) => void;
  onApiError: (err: unknown, fallbackMessage: string) => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export function AdminProtectionModal({
  open,
  books,
  initialShelfKey,
  initialBookId,
  onClose,
  onBookPackSynced,
  onStorageSynced,
  onLogout,
  onSessionReissued,
  onApiError,
  onNotify,
}: AdminProtectionModalProps) {
  const [activeTab, setActiveTab] = useState<ProtectionTab>('sync');
  const [syncing, setSyncing] = useState(false);

  const mountedRef = useRef(true);
  const guestsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      guestsAbortRef.current?.abort();
      guestsAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (open && (initialShelfKey || initialBookId)) {
      setActiveTab('sync');
    }
  }, [initialBookId, initialShelfKey, open]);

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
    guestsAbortRef.current?.abort();
    const controller = new AbortController();
    guestsAbortRef.current = controller;
    setLoadingGuests(true);
    try {
      const list = await fetchAdminDiscordGuests(controller.signal);
      if (!controller.signal.aborted && mountedRef.current) {
        setGuests(list);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (mountedRef.current || isAuthError(err)) {
        onApiError(err, 'Không thể tải danh sách khách Discord.');
      }
    } finally {
      if (guestsAbortRef.current === controller) guestsAbortRef.current = null;
      if (!controller.signal.aborted && mountedRef.current) {
        setLoadingGuests(false);
      }
    }
  }, [onApiError]);

  useEffect(() => {
    if (open && activeTab === 'guests') {
      void loadGuests();
      return () => {
        guestsAbortRef.current?.abort();
        guestsAbortRef.current = null;
      };
    }
  }, [activeTab, loadGuests, open]);

  if (!open) return null;

  const handleForensicScan = async () => {
    const clean = sampleText.trim();
    if (clean.length < 80) {
      onNotify(
        'Hãy dán đoạn văn dài ít nhất 80 ký tự (tốt nhất là nửa chương hoặc cả chương).',
        'warning',
      );
      return;
    }
    setCheckingForensic(true);
    try {
      const report = await runAdminForensicWatermarkCheck(clean);
      if (mountedRef.current) setForensicReport(report);
    } catch (err) {
      if (mountedRef.current || isAuthError(err)) {
        onApiError(err, 'Không thể quét dấu vân tay văn bản.');
      }
    } finally {
      if (mountedRef.current) setCheckingForensic(false);
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
      if (!mountedRef.current) return;
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
      if (mountedRef.current || isAuthError(err)) {
        onApiError(err, 'Không thể cập nhật trạng thái khoá.');
      }
    } finally {
      if (mountedRef.current) setTogglingUserId(null);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      closeDisabled={syncing}
      ariaLabel="Bảo mật nội dung chế độ khách"
      zIndexClass="z-50"
      panelClassName="moonlit-card fade-in flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl dark:border-line-strong/70"
    >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold">Bảo mật Nội dung Khách (D-028)</h2>
              <p className="text-xs text-ink-muted">
                Chống tải file gốc, đọc Canvas nhiễu nền &amp; truy vết thuỷ vân Discord 32-bit
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
              disabled={syncing && id !== 'sync'}
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition disabled:opacity-45 ${
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

        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
          {activeTab === 'sync' && (
            <AdminProtectionSyncTab
              eligibleBooks={eligibleBooks}
              missingBooks={missingBooks}
              readyCount={readyCount}
              initialShelfKey={initialShelfKey}
              initialBookId={initialBookId}
              syncing={syncing}
              onSyncingChange={setSyncing}
              onBookPackSynced={onBookPackSynced}
              onStorageSynced={onStorageSynced}
              onApiError={onApiError}
              onNotify={onNotify}
            />
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

        {isCloudMode && (
          <div className="border-t border-line bg-canvas/70 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-ink-muted">
                Nghi ngờ lộ phiên quản trị? Thu hồi ngay toàn bộ token Admin cũ trên mọi thiết bị.
              </p>
              <AdminRevokeSessionsAction
                disabled={syncing}
                onRevokedLogout={() => {
                  onClose();
                  onLogout?.();
                }}
                onSessionReissued={onSessionReissued}
                onApiError={onApiError}
                onNotify={onNotify}
              />
            </div>
          </div>
        )}
    </ModalShell>
  );
}
