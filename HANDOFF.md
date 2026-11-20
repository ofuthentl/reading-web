# HANDOFF
Cập nhật: 2026-11-20 23:34 | Nhánh: feat/migrate-cloudflare | Build: 🟢 frontend · 🟢 Worker · 🟢 ESLint 100%
Nhiệm vụ hiện tại: Phase 3 (giao diện 2D & deploy) — xong Sub-phase 3.0 → 3.4 theo docs/plans/phase-3-2d.md
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/

## Đang làm dở
- Toàn bộ giao diện 2D + quản lý sách + trình đọc (EPUB/MOBI/PDF/CBZ) của **Ofu's Library** đã hoàn chỉnh và sạch 0 lỗi, 0 cảnh báo ở cả `typecheck`, `lint`, `build` và Worker `typecheck`.
- Worker live tại `https://arcane-library-api.novel-check-d467614e.workers.dev` (`.env.local` đã trỏ sẵn).

## Bước tiếp theo
1. Thực hiện Sub-phase 3.5: chạy kiểm thử thủ công qua 10 mục Checklist + 12 mục lỗi bản cũ trong `docs/plans/phase-3-2d.md` với Worker/D1/R2 thật, và kiểm tra/cấu hình secret `VITE_API_URL` trên GitHub Actions.
2. Thực hiện Sub-phase 3.6: đẩy nhánh `feat/migrate-cloudflare`, mở Pull Request vào `main`, xác nhận CI xanh → duyệt & merge deploy lên `https://ofu.lol`, rồi dọn hậu kỳ Supabase (D-001).

## Lỗi / chặn
- Không có lỗi/chặn nào. Mọi file `.ts`/`.tsx` toàn repo đều ≤ 500 dòng, `src/App.tsx` gọn 191 dòng (< 200).

## Xong trong nhiệm vụ này
- **Sub-phase 3.4**: tách `ReaderSettingsPopover` + `ReaderTocDrawer` + `src/lib/readerConfig.ts` từ `ReaderView.tsx` (đưa về ≤ 500 dòng, đồng bộ bảng màu với Ofu's Library), dọn CSS `.pdf-*` lỗi thời & thêm `.font-reader-*` trong `src/index.css`, tạo `useBookReader` (chống rò rỉ `ObjectURL` bằng request ID + `dispose()`) và nối `ReaderView` vào `App.tsx` (< 200 dòng).
- **Sub-phase 3.3**: `UploadDropzone`, `UploadQueueList`, `shelfPlacement.ts` (phân bổ & tự gom kệ thông minh), `BookEditModal`, `ShelfRenameModal`, `DeleteConfirmModal`.
- **Sub-phase 3.2**: hệ 3 chế độ màu (`useTheme`, `ThemeToggle`), `useCoverUrl`, `BookCard`, `LibraryHeader`, `Library2DView`.
- **Sub-phase 3.1**: D-005, `ErrorBoundary`, `useToast`, `ToastContainer`, `AuthGate`, vỏ `App.tsx` tối giản.
- **Sub-phase 3.0**: tách `workers/r2-storage/src/auth.ts` (fail-closed), tạo D1 `library-db` + R2 `arcane-library-books`, đặt secret & deploy Worker.
