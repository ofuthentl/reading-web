# HANDOFF
Cập nhật: 2026-11-22 20:40 | Nhánh: feat/web-2d-enhancements | Build: 🟢 frontend (`<= 86.04 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất trọn bộ 5 Phase Nâng cấp Web 2D (`D-029`), Tab Ủng hộ & nút Admin Thêm ghi chú hàng loạt cho bộ truyện** — sẵn sàng deploy Worker & mở PR vào `main`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/web-2d-enhancements.md

## Đang làm dở
- Đã hoàn tất trọn vẹn **Phase 1 → Phase 5** kèm các tinh chỉnh UI/UX trên nhánh `feat/web-2d-enhancements` (`D-029`):
  1. **Worker & D1 (`0005_bookmarks.sql`, `bookmarksDb.ts`, `weeklyPopular.ts`, `guestSearch.ts`, `r2Files.ts`):** xếp hạng từng Tập sách thịnh hành 7 ngày (`weeklyPopular`), CRUD dấu trang cách ly `owner` vs `guest:<discord_user_id>`, tìm chương khớp từ khoá cho `guest` (`0` lộ văn bản thô).
  2. **Trang chủ, Thư viện & Ủng hộ 2D (`EditorialBookStrip.tsx`, `Library2DView.tsx`, `BookCard.tsx`, `ShelfCoverCard.tsx`, `SupportView.tsx`, `ShelfBatchNoteModal.tsx`):** đồng bộ **tông đỏ đô `#B22222`** trên toàn bộ tiêu đề & thanh tiến trình, bỏ viền trắng thẻ ở 2 chế độ tối, nghiêng bìa 3D theo chuột, hộp *Dung lượng* gọn trong thanh lọc Trang chủ, tab **Ủng hộ** 2 cột `Text | QR` (`public/support-qr.png`), và nút Admin **Thêm ghi chú** hàng loạt cho các tập chưa có trong kệ (hỗ trợ cả ghi chú chung, điền từng tập & tự trích từ EPUB).
  3. **Giới thiệu & Thống kê (`BookInfoModal.tsx`, `ReadingStatsModal.tsx`, `ShelfDetailView.tsx`):** xem `book.description`, đánh dấu hoàn thành / đặt lại tiến độ 1 chạm, hiện mô tả bộ trên Hero kệ & bảng thống kê đọc 2D (`LV/XP`, trang đọc, nhật ký).
  4. **Trình đọc nâng cao (`ReaderTopBar.tsx`, `useReaderController.ts`, `ReaderPaginatedView.tsx`, `GuestCanvasPaginatedView.tsx`, `GuestCanvasReader.tsx`, `readerConfig.ts`):** chế độ **Cuộn dọc ↔ Lật trang (2 cột)** sắc nét 100% vector (0 canvas phụ gây mờ chữ, hạt giấy tuần hoàn `2π` tiệp màu trang, vạch chia trang mảnh `1px` kéo thẳng sát từ thanh trên xuống thanh chân trang, sửa dứt điểm lỗi kẹt `760px` khi mới mở Cuộn dọc & lỗi nháy số trang vượt giới hạn khi đổi `Gọn/Vừa/Rộng`), nút **Đọc tiếp Tập kế →**, `Immersive Mode`, phím tắt `/`, `Ctrl+K`, `M`, `B`, `F`, ngăn kéo 3 tab & Lightbox zoom ảnh.

## Bước tiếp theo
1. Deploy cập nhật Cloudflare Worker (`wrangler deploy` — bảng `book_bookmarks` tự khởi tạo an toàn).
2. Push nhánh `feat/web-2d-enhancements` và tạo Pull Request vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/web-2d-enhancements` (`D-029`):** Hoàn tất 5 Phase nâng cấp giao diện & trình đọc 2D.
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
