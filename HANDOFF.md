# HANDOFF
Cập nhật: 2026-11-25 11:36 | Nhánh: fix/toc-layout-and-numbering | Build: 🟢 XANH (`index-*.js = 84.78 kB` gzip <= `86.04 kB`)
Nhiệm vụ hiện tại: **Sửa lỗi dính dòng & bỏ đánh số thứ tự thừa trên trang Mục lục và Ngăn kéo Mục lục (`D-043` — chốt `1A`, `2A`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/fix-toc-layout-and-numbering.md

## Đang làm dở
- Không có — toàn bộ bản vá đã kiểm thử trực quan trên trình duyệt thật (Desktop + Mobile) & logic 7/7 ca, sẵn sàng push/mở PR merge vào `main`.

## Xong trong nhánh này
1. **Chuẩn hoá Mục lục dùng chung & tự phục hồi gói cũ `0 B` R2 (`src/lib/tocFormat.ts`, `src/types.ts`, `workers/r2-storage/src/forensicWatermark.ts`):**
   - Mở rộng kiểu `GuestBlock` loại `list` thêm `plain?: 1` & `depths?: number[]` tương thích ngược 100% với Worker hiện tại.
   - Bổ sung `isTocChapterTitle`, `stripDuplicateLeadingTocHeadingHtml` và `prepareGuestTocBlocks` tự bỏ đánh số & tách dòng gói `guest-pack` cũ bị dính thành 1 đoạn dài (bảo toàn `blockIndex`, tránh cắt nhầm từ viết thường tiếng Việt và không thụt lề nhầm `Chương N` sau `Mở đầu`).
2. **Trình đọc DOM & Ngăn kéo Mục lục (`src/styles/reader.css`, `ReaderDomScrollStage.tsx`, `ReaderPaginatedView.tsx`, `ReaderTocDrawer.tsx`):**
   - Tắt đánh số `1., 2., 3.`, căn trái gọn, bỏ tiêu đề lặp và giữ thụt lề phân cấp cho `<nav>` / chương Mục lục trên cả Cuộn dọc lẫn Lật trang (vẫn giữ đánh số cho `<ol>` thường trong thân truyện).
   - Gỡ cột số thứ tự `01, 02, 03` khỏi `ReaderTocDrawer.tsx`.
3. **Sửa gốc đóng gói & Dàn trang Guest Canvas (`src/lib/guestPackHtml.ts`, `src/lib/guestPackBuilder.ts`, `src/lib/guestCanvasLayout.ts`, `useGuestCanvasViewport.ts`, `GuestCanvasPaginatedView.tsx`, `GuestCanvasReader.tsx`):**
   - Tách `guestPackHtml.ts`, thêm `<nav>`/`<aside>`/`<dl>`… vào `CONTAINER_BLOCK_TAGS`, duyệt đệ quy `<ul>`/`<ol>` lồng nhau giữ `depths` và xuất `plain: 1` cho Mục lục; truyền `tocTitles` vào `computeChapterCanvasLayout` để hiển thị sạch không số thứ tự cho cả gói mới lẫn gói cũ trên R2.

## Bước tiếp theo
1. Push nhánh `fix/toc-layout-and-numbering` và mở Pull Request merge vào `main` trên GitHub để tự động deploy frontend lên `https://ofu.lol` (không cần re-deploy Worker hay chạy migration D1/R2).

## Lỗi / chặn
- Không có lỗi/chặn. Giữ nguyên không đụng 3 tệp/thư mục chưa theo dõi sẵn ngoài Git ở thư mục gốc.
