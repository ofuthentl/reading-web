/**
 * Đăng ký Service Worker siêu mỏng `public/sw.js` (D-036 QĐ-D).
 * Chỉ chạy trên bản build production để không can thiệp HMR của Vite Dev Server.
 */
export function registerPwaServiceWorker(): void {
  if (typeof window === 'undefined' || import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;

  const register = () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL })
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
