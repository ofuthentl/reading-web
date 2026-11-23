# HANDOFF
Cập nhật: 2026-11-23 10:10 | Nhánh: fix/mobile-reader-horizontal-overflow | Build: 🟢 frontend (`85.80 kB` gzip, `0 B` three) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Sửa lỗi tràn ngang trên trình đọc điện thoại do nút `Đọc tiếp` tên tập dài thiếu `min-w-0` (`loi_dien_thoai.mp4`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md

## Đang làm dở
- Trên nhánh `fix/mobile-reader-horizontal-overflow` (tách từ `origin/main` sau PR #16):
  1. **Sửa lỗi tràn ngang & lệch nút cuối sách (`docs/plans/fix-mobile-reader-horizontal-overflow.md`):**
     - `ReaderChapterEndNav.tsx`: đổi cụm cuối sách sang `contents sm:flex sm:min-w-0 sm:max-w-full ...` + `min-w-0 truncate` để mobile xếp gọn hàng 1 (`< Trước` + `Hoàn thành cuốn này!`) và hàng 2 (`Đọc tiếp: ... →` cắt ngắn vừa màn hình).
     - `ReaderView.tsx` & `GuestCanvasReader.tsx`: thêm `overflow-x-hidden` trên `<main>` và `min-w-0` / `max-w-full` cho khung nội dung.
     - `src/index.css`: thêm `overflow-wrap: break-word` cho `.reading-content` và `max-width: 100%; overflow-x: auto` cho `.reading-content pre`.
     - `ReaderPaginatedView.tsx` & `GuestCanvasPaginatedView.tsx`: thêm `min-w-0 max-w-full` cho cụm nút `Hoàn thành` + `Đọc tiếp` trong `<footer>`.
  2. Đã kiểm định `typecheck`, `lint` (`0/0`), `build` (`85.80 kB` gzip) và kiểm thử trực tiếp trên viewport `390×652` với bộ 2 tập tên dài giống hệt video (`0px` tràn ngang ở cả Cuộn dọc lẫn Lật trang).

## Bước tiếp theo
1. Mở Pull Request `fix/mobile-reader-horizontal-overflow` vào `main` và bấm Merge khi CI xanh để đưa lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #16 (`fix/mobile-reader-viewport`):** Sửa lỗi che đáy trình đọc mobile (`100vh` → `max-h-dvh` + `safe-area-inset-bottom`) & cập nhật lời giới thiệu tab Ủng hộ đã merge vào `main`.
- **PR #15 (`feat/locked-entrance-link`):** Nút dẫn sang `/entrance` trên `/locked` và ô nhập mã đơn duy nhất (`D-027`) đã merge vào `main`.
