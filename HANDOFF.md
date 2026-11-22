# HANDOFF
Cập nhật: 2026-11-22 11:06 | Nhánh: feat/web-2d-enhancements | Build: 🟢 frontend · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Triển khai Nâng cấp Web 2D (`D-029`) — xong Phase 1–2/5, đang vào Phase 3**
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/web-2d-enhancements.md

## Đang làm dở
- Đã hoàn tất **Phase 1 & Phase 2**:
  1. Hạ tầng Worker & D1: `0005_bookmarks.sql`, `bookmarksDb.ts`, `weeklyPopular.ts`, `guestSearch.ts`, `r2Files.ts`, `bookmarksApi.ts`.
  2. Cặp 2 dải thẻ biên tập ngang `EditorialBookStrip.tsx` (**`01 Thịnh hành` *`tuần này`*** theo từng Tập & **`02 Mới cập nhật` *`gần đây`***) chuẩn bản sắc Ofu's Library (`D-027`).
  3. Thanh lọc trạng thái/định dạng & sắp xếp `LibraryFilterBar.tsx` trên cả Trang chủ lẫn Thư viện; huy hiệu `MỚI`, nhãn gói bảo mật cho `guest`, gỡ nhanh sách khỏi *Tiếp tục đọc* và yêu thích kệ cục bộ `useGuestLocalFavorites.ts`.

## Bước tiếp theo
1. **Phase 3:** Tạo `BookInfoModal.tsx` (`description` + Đánh dấu hoàn thành + Đặt lại tiến độ), hiện mô tả bộ trên Hero `ShelfDetailView` & tạo `ReadingStatsModal.tsx` (kèm vỏ `ReaderOverlaysHost` giữ `App.tsx` gọn nhẹ).
2. **Phase 4:** Nút *Đọc tiếp Tập kế →* cuối sách, `Immersive Mode` tự ẩn thanh công cụ & phím tắt `/`, `Ctrl+K`, `M`, `B`, `F`.
3. **Phase 5:** Zoom ảnh minh hoạ `ReaderImageLightbox` & Tìm chữ / Dấu trang trong trình đọc.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
