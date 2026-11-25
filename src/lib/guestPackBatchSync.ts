import type { Book, StorageStats } from '@/types';
import { fetchBookBlobCached, formatBytes, isAuthError } from '@/lib/api';
import { fetchLatestStorageStats } from '@/lib/apiAdminMutations';
import { buildGuestPackEnvelope, uploadGuestPackEnvelope } from '@/lib/guestPackBuilder';

export const LARGE_PACK_SYNC_FILE_BYTES = 40 * 1024 * 1024; // 40 MiB

export function resolvePackSyncConcurrency(fileSizeBytes: number): 1 | 2 {
  return fileSizeBytes > LARGE_PACK_SYNC_FILE_BYTES ? 1 : 2;
}

export interface GuestPackBatchProgress {
  done: number;
  total: number;
  successCount: number;
  failCount: number;
  activeTitles: string[];
  stepLabel?: string;
}

export interface GuestPackBatchResult {
  successCount: number;
  failCount: number;
  stopped: boolean;
  authError: unknown | null;
}

export interface GuestPackSyncController {
  stop: () => void;
  isStopped: () => boolean;
}

export function createGuestPackSyncController(): GuestPackSyncController & {
  track: (controller: AbortController) => () => void;
} {
  let stopped = false;
  const active = new Set<AbortController>();
  return {
    stop() {
      stopped = true;
      for (const ctrl of active) {
        ctrl.abort();
      }
      active.clear();
    },
    isStopped() {
      return stopped;
    },
    track(controller: AbortController) {
      active.add(controller);
      return () => {
        active.delete(controller);
      };
    },
  };
}

export interface RunAdaptiveGuestPackSyncOptions {
  targets: readonly Book[];
  controller: ReturnType<typeof createGuestPackSyncController>;
  onProgress: (progress: GuestPackBatchProgress) => void;
  onBookSynced: (bookId: string, storage?: StorageStats) => void;
  onStorageSynced?: (storage: StorageStats) => void;
}

export async function runAdaptiveGuestPackSync({
  targets,
  controller,
  onProgress,
  onBookSynced,
  onStorageSynced,
}: RunAdaptiveGuestPackSyncOptions): Promise<GuestPackBatchResult> {
  const total = targets.length;
  if (total === 0) {
    return { successCount: 0, failCount: 0, stopped: false, authError: null };
  }

  let nextIdx = 0;
  let completedCount = 0;
  let successCount = 0;
  let failCount = 0;
  let authError: unknown = null;
  let inFlightCount = 0;
  let exclusiveRunning = false;
  const activeSteps = new Map<string, { title: string; step: string }>();

  const emitProgress = () => {
    const entries = Array.from(activeSteps.values());
    onProgress({
      done: completedCount,
      total,
      successCount,
      failCount,
      activeTitles: entries.map((e) => e.title),
      stepLabel: entries[0]?.step,
    });
  };

  const runOne = async (target: Book) => {
    const abortCtrl = new AbortController();
    const untrack = controller.track(abortCtrl);
    activeSteps.set(target.id, {
      title: target.title,
      step: `Đang tải tệp (${formatBytes(target.file_size)})...`,
    });
    emitProgress();

    try {
      const { blob } = await fetchBookBlobCached(target, {
        cacheOnFetch: false,
        signal: abortCtrl.signal,
      });
      if (controller.isStopped() || abortCtrl.signal.aborted) return;

      activeSteps.set(target.id, {
        title: target.title,
        step: 'Đang nén & đóng gói OFGP...',
      });
      emitProgress();

      const envelope = await buildGuestPackEnvelope(blob, target, {
        signal: abortCtrl.signal,
      });
      if (controller.isStopped() || abortCtrl.signal.aborted) return;

      activeSteps.set(target.id, {
        title: target.title,
        step: 'Đang tải gói bảo mật lên R2...',
      });
      emitProgress();

      const res = await uploadGuestPackEnvelope(target.id, envelope);
      // Luôn báo về store ngay cả khi người dùng vừa bấm Dừng trong lúc request này vừa thành công trên server
      onBookSynced(target.id, res.storage);
      successCount += 1;
    } catch (err) {
      if (isAuthError(err)) {
        authError = err;
        controller.stop();
        return;
      }
      if (controller.isStopped() || abortCtrl.signal.aborted) return;
      failCount += 1;
      console.warn(`Lỗi tạo gói khách cho "${target.title}":`, err);
    } finally {
      untrack();
      activeSteps.delete(target.id);
      if (!abortCtrl.signal.aborted || successCount + failCount > completedCount) {
        completedCount = Math.min(total, successCount + failCount);
      }
      emitProgress();
    }
  };

  await new Promise<void>((resolve) => {
    const pump = () => {
      if (authError || controller.isStopped()) {
        if (inFlightCount === 0) resolve();
        return;
      }

      while (nextIdx < total && !controller.isStopped() && !authError) {
        if (exclusiveRunning) break;
        const candidate = targets[nextIdx];
        const neededConcurrency = resolvePackSyncConcurrency(candidate.file_size || 0);
        if (neededConcurrency === 1 && inFlightCount > 0) {
          // Chờ các tác vụ nhẹ chạy xong rồi mới chạy file > 40 MB đơn luồng tránh tràn RAM
          break;
        }
        if (inFlightCount >= neededConcurrency) break;

        nextIdx += 1;
        inFlightCount += 1;
        if (neededConcurrency === 1) exclusiveRunning = true;

        void runOne(candidate).finally(() => {
          inFlightCount -= 1;
          if (neededConcurrency === 1) exclusiveRunning = false;
          if (inFlightCount === 0 && (nextIdx >= total || controller.isStopped() || authError)) {
            resolve();
          } else {
            pump();
          }
        });
      }

      if (inFlightCount === 0 && (nextIdx >= total || controller.isStopped() || authError)) {
        resolve();
      }
    };

    pump();
  });

  // Đồng bộ lại dung lượng chuẩn từ server sau lô chạy song song hoặc dừng giữa chừng
  if (!authError && successCount > 0 && onStorageSynced) {
    const freshStorage = await fetchLatestStorageStats().catch(() => null);
    if (freshStorage) onStorageSynced(freshStorage);
  }

  return {
    successCount,
    failCount,
    stopped: controller.isStopped() && !authError,
    authError,
  };
}
