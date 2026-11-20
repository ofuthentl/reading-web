# HANDOFF
Cập nhật: 2026-11-20 22:12 | Nhánh: feat/migrate-cloudflare | Build: 🟢 frontend · 🟢 Worker (ESLint chỉ còn ReaderView.tsx tách ở 3.4)
Nhiệm vụ hiện tại: Phase 3 (giao diện 2D & deploy) — xong Sub-phase 3.0, 3.1 & 3.2 theo docs/plans/phase-3-2d.md
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Thương hiệu chuẩn: **Ofu's Library**. Hệ 3 chế độ màu đồng nhất toàn app (`ofu-library-theme` trong `localStorage`, nút xoay vòng 1 chạm kiểu Cyanodex `ThemeToggle`, hỗ trợ View Transitions API):
  - **Ban ngày (`light`)**: Warm Parchment — nền `#f6f1e7`, thẻ `#fdfaf4`, viền `#e5dccb`, chữ `#2b241d`/`#6d6154`, nhấn nâu đồng `#8c5e35`.
  - **Than chì (`dim`)**: Tối dịu trung tính — nền `#17171a`, thẻ `#212125`, viền `#36363d`/`#52525b`, chữ & nút đồng bộ trắng `#f2f2f0` / xám bạc `#b5b5b3`.
  - **Đêm khuya (`midnight`)**: Đen sâu nhất — nền `#08080a`, thẻ `#111114`, viền `#24242b`/`#3e3e48`, chữ & nút đồng bộ trắng `#f4f4f5` / `#a1a1aa`.
- Worker live tại `https://arcane-library-api.novel-check-d467614e.workers.dev` (`.env.local` đã trỏ sẵn).

## Bước tiếp theo
1. Thực hiện Sub-phase 3.3: `UploadDropzone`, `BookEditModal`, `ShelfRenameModal`, `DeleteConfirmModal` và nối vào `Library2DView` + `App.tsx` (dùng cùng hệ token Sáng/Tối `canvas`/`surface`/`line`/`ink`/`accent`).
2. Tiếp tục Sub-phase 3.4 → 3.6 theo `docs/plans/phase-3-2d.md`.

## Lỗi / chặn
- ESLint `max-lines` (500): chỉ còn duy nhất `src/components/ReaderView.tsx` (673 dòng hiệu dụng, tách ở 3.4).

## Xong trong nhiệm vụ này
- **Sub-phase 3.2**: chuẩn hoá hệ màu Sáng/Tối toàn app (`useTheme`, anti-FOUC `index.html`, tokens Tailwind/CSS variables, đồng bộ `AuthGate`, `ToastContainer`, `ErrorBoundary`), tạo `useCoverUrl` (kèm `URL.revokeObjectURL`), `BookCard` (bìa `3/4` ảnh/bìa vải fallback, tiến độ %, badge, chọn nhiều), `LibraryHeader` (thanh dung lượng `formatBytes`, nút Sáng/Tối/Upload/Chọn/Làm mới/Đăng xuất), `Library2DView` (Tiếp tục đọc, tìm kiếm tên/tác giả/kệ, lọc kệ, danh sách kệ `groupBooksIntoShelves`) và nối vào `App.tsx`.
- **Sub-phase 3.1**: áp dụng D-005, tạo `ErrorBoundary`, `useToast`, `ToastContainer`, `AuthGate`, vỏ `App.tsx` tối giản, gỡ override `max-lines` cho `App.tsx`.
- **Sub-phase 3.0**: tách `workers/r2-storage/src/auth.ts` (fail-closed), tạo D1 `library-db` + R2 `arcane-library-books`, đặt secret và deploy Worker.
- Phase 0–2 + Branch protection cho `main` đã hoàn tất.
