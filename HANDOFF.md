# HANDOFF
Cập nhật: 2026-11-23 09:43 | Nhánh: fix/mobile-reader-viewport | Build: 🟢 frontend (`85.81 kB` gzip, `0 B` three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Sửa lỗi thanh chuyển chương cuối trang trình đọc bị che trên điện thoại (`100vh` → `max-h-dvh`) & cập nhật lời giới thiệu tab Ủng hộ**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Trên nhánh `fix/mobile-reader-viewport` (tách từ `origin/main` sau PR #15):
  1. **Chuẩn hoá viewport động cho toàn bộ trình đọc (PA-1, `docs/plans/fix-mobile-reader-viewport.md`):**
     - `ActiveReaderHost.tsx`: bọc trình đọc bằng `fixed inset-0 z-40 flex max-h-dvh flex-col overflow-hidden`.
     - `ReaderView.tsx` & `GuestCanvasReader.tsx`: thay `h-screen` bằng `h-full min-h-0 flex-1`, thêm `min-h-0 overscroll-y-contain` và đệm đáy `env(safe-area-inset-bottom)` cho `<main>`; bỏ `h-[calc(100vh-3.25rem)]` ở PDF Suspense fallback.
     - `ReaderChapterEndNav.tsx`, `ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx`, `PdfReader.tsx`, `PdfReaderFallback.tsx`, `ReaderTocDrawer.tsx`, `ReaderSearchAndBookmarks.tsx`: đồng bộ `min-h-0 flex-1`, `max-h-dvh`, `max-w-full` mobile và đệm đáy `env(safe-area-inset-bottom)`.
  2. **Cập nhật nội dung mô tả tab Ủng hộ (`src/components/SupportView.tsx`):** bổ sung cụm *"trên nền tảng web"*, *", điều đó sẽ giúp mình rất nhiều."* và đổi *"động viên"* → *"động lực"*.
  3. Đã kiểm định `typecheck`, `lint` (`0/0`), `build` (`85.81 kB` gzip) và kiểm thử trực tiếp trên viewport `390×652`.

## Bước tiếp theo
1. Push nhánh `fix/mobile-reader-viewport` và mở Pull Request vào `main`, bấm Merge khi CI xanh để cập nhật lên `ofu.lol`.
2. Mở thử 1 chương dài trên Chrome iOS thực tế; nếu bản Chrome iOS cụ thể nào còn lệch thanh đáy do lỗi WebKit, chỉ cần thêm lớp fallback JS `visualViewport` (PA-2) trong riêng `ActiveReaderHost.tsx`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #15 (`feat/locked-entrance-link`):** Nút dẫn sang `/entrance` trên `/locked` và ô nhập mã đơn duy nhất (`D-027`) đã merge vào `main`.
- **PR #14 (`fix/mobile-admin-header`):** Gọn header Admin mobile, tối ưu cuộn 144 FPS & logo mèo đọc sách đã merge vào `main`.
