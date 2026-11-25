/**
 * Đăng ký Service Worker siêu mỏng `public/sw.js` (D-036 QĐ-D / D-046 Phase 1.5).
 * - Chỉ chạy trên bản build production để không can thiệp HMR của Vite Dev Server.
 * - Phát hiện bản build mới đang chờ (`registration.waiting` / `updatefound`) để hiển thị
 *   thông báo 1 chạm gọi `SKIP_WAITING` và tải lại trang đúng 1 lần khi `controllerchange`.
 */

type PwaUpdateListener = (applyUpdate: () => void) => void;

const updateListeners = new Set<PwaUpdateListener>();
let pendingApplyUpdate: (() => void) | null = null;
let hasRegistered = false;

export function subscribePwaUpdate(listener: PwaUpdateListener): () => void {
  updateListeners.add(listener);
  if (pendingApplyUpdate) {
    listener(pendingApplyUpdate);
  }
  return () => {
    updateListeners.delete(listener);
  };
}

export function registerPwaServiceWorker(): void {
  if (hasRegistered) return;
  if (typeof window === 'undefined' || import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  hasRegistered = true;

  let refreshing = false;
  let userRequestedUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!userRequestedUpdate || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const notifyWaitingWorker = (waiting: ServiceWorker) => {
    const applyUpdate = () => {
      userRequestedUpdate = true;
      try {
        waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        window.location.reload();
      }
    };
    pendingApplyUpdate = applyUpdate;
    for (const listener of updateListeners) {
      listener(applyUpdate);
    }
  };

  const register = () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyWaitingWorker(registration.waiting);
        }
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              notifyWaitingWorker(registration.waiting || installing);
            }
          });
        });
      })
      .catch(() => {
        // Bỏ qua mềm nếu trình duyệt chặn Service Worker ở chế độ ẩn danh
      });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
