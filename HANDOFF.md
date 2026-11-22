# HANDOFF
Cập nhật: 2026-11-22 11:25 | Nhánh: feat/web-2d-enhancements | Build: 🟢 frontend (`<= 86.04 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất trọn bộ 5 Phase Nâng cấp Web 2D (`D-029`)** — sẵn sàng deploy Worker & mở PR vào `main`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/web-2d-enhancements.md

## Đang làm dở
- Đã hoàn tất trọn vẹn **Phase 1 → Phase 5** trên nhánh `feat/web-2d-enhancements` (`D-029`):
  1. **Worker & D1 (`0005_bookmarks.sql`, `bookmarksDb.ts`, `weeklyPopular.ts`, `guestSearch.ts`, `r2Files.ts`):** xếp hạng từng Tập sách thịnh hành 7 ngày (`weeklyPopular`), CRUD dấu trang cách ly `owner` vs `guest:<discord_user_id>`, tìm chương khớp từ khoá cho `guest` (`0` lộ văn bản thô).
  2. **Trang chủ & Thư viện 2D (`EditorialBookStrip.tsx`, `LibraryFilterBar.tsx`, `useGuestLocalFavorites.ts`):** cặp 2 dải biên tập **`01 Thịnh hành` *`tuần này`*** & **`02 Mới cập nhật` *`gần đây`*** (lớp shader tối đa tầng + số viền mảnh nghệ thuật độ tương phản cao, thanh cuộn ẩn nền trong suốt tiệp màu cả 3 theme), lọc trạng thái/định dạng & sắp xếp, nhãn `MỚI`, gỡ nhanh *Tiếp tục đọc* & yêu thích cục bộ cho `guest`.
  3. **Giới thiệu & Thống kê (`BookInfoModal.tsx`, `ReadingStatsModal.tsx`, `ShelfDetailView.tsx`):** xem `book.description`, đánh dấu hoàn thành / đặt lại tiến độ 1 chạm, hiện mô tả bộ trên Hero kệ & bảng thống kê đọc 2D (`LV/XP`, trang đọc, nhật ký).
  4. **Trình đọc nâng cao (`ReaderTopBar.tsx`, `useReaderController.ts`, `ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx`, `ReaderChapterEndNav.tsx`, `ReaderSearchAndBookmarks.tsx`, `ReaderImageLightbox.tsx`):** tuỳ chọn **Cuộn dọc ↔ Lật trang (2 cột)** chuẩn `D-011` cho cả `owner` & `guest` (`<canvas>` thuỷ vân), nút **Đọc tiếp Tập kế →** cuối sách, tự ẩn thanh công cụ (`Immersive Mode`), phím tắt `/`, `Ctrl+K`, `M`, `B`, `F`, ngăn kéo 3 tab (Mục lục · Tìm chữ · Dấu trang) & Lightbox zoom ảnh minh hoạ.

## Bước tiếp theo
1. Deploy cập nhật Cloudflare Worker (`wrangler deploy` — bảng `book_bookmarks` tự khởi tạo an toàn).
2. Push nhánh `feat/web-2d-enhancements` và tạo Pull Request vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/web-2d-enhancements` (`D-029`):** Hoàn tất 5 Phase nâng cấp giao diện & trình đọc 2D.
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
