# HANDOFF
Cập nhật: 2026-11-20 23:02 | Nhánh: feat/migrate-cloudflare | Build: 🟢 frontend · 🟢 Worker (ESLint chỉ còn ReaderView.tsx tách ở 3.4)
Nhiệm vụ hiện tại: Phase 3 (giao diện 2D & deploy) — xong Sub-phase 3.0, 3.1, 3.2 & 3.3 theo docs/plans/phase-3-2d.md
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Thương hiệu chuẩn: **Ofu's Library**. Hệ 3 chế độ màu đồng nhất toàn app (`ofu-library-theme` trong `localStorage`, nút xoay vòng `ThemeToggle`, hỗ trợ View Transitions API): **Ban ngày (`light`)** · **Chiều tối (`dim`)** · **Đêm khuya (`midnight`)**.
- Worker live tại `https://arcane-library-api.novel-check-d467614e.workers.dev` (`.env.local` đã trỏ sẵn).

## Bước tiếp theo
1. Thực hiện Sub-phase 3.4: tách `ReaderSettingsPopover` + `ReaderTocDrawer` từ `ReaderView.tsx` (đưa `ReaderView.tsx` về ≤ 500 dòng để ESLint toàn repo xanh 100%), dọn CSS cũ trong `src/index.css`, và nối trình đọc (`fetchBookBlobCached` + `parseBookBlob` + `dispose()` + `saveReadingProgress`) vào `App.tsx`.
2. Thực hiện Sub-phase 3.5 (kiểm thử checklist với Worker/D1/R2 thật, cấu hình secret `VITE_API_URL` trên GitHub) → 3.6 (mở PR vào `main`, CI xanh, merge deploy lên `ofu.lol`).

## Lỗi / chặn
- ESLint `max-lines` (500): chỉ còn duy nhất `src/components/ReaderView.tsx` (673 dòng hiệu dụng, tách ở 3.4).

## Xong trong nhiệm vụ này
- **Sub-phase 3.3**: tạo `UploadDropzone` (kéo-thả nhiều file EPUB/MOBI/PDF/CBZ, kiểm tra trùng qua `bookDuplicateKey`, upload tuần tự từng tệp qua `uploadBook`, tiến độ & cảnh báo 9.0 GB), `BookEditModal` (sửa metadata, gợi ý kệ, đổi bìa qua `updateBookCover` kèm `URL.revokeObjectURL`, nút xoá 1 sách), `ShelfRenameModal` (`renameShelfAll`), `DeleteConfirmModal` (`deleteBooks` + dung lượng giải phóng `formatBytes`), nối toàn bộ vào `Library2DView` và `App.tsx` (< 200 dòng) với 100% semantic tokens cho cả 3 chế độ màu.
- **Sub-phase 3.2**: hệ 3 chế độ màu (`useTheme`, `ThemeToggle`), `useCoverUrl`, `BookCard`, `LibraryHeader`, `Library2DView`.
- **Sub-phase 3.1**: áp dụng D-005, `ErrorBoundary`, `useToast`, `ToastContainer`, `AuthGate`, vỏ `App.tsx` tối giản.
- **Sub-phase 3.0**: tách `workers/r2-storage/src/auth.ts` (fail-closed), tạo D1 `library-db` + R2 `arcane-library-books`, đặt secret và deploy Worker.
- Phase 0–2 + Branch protection cho `main` đã hoàn tất.
