# HANDOFF
Cập nhật: 2026-11-22 11:11 | Nhánh: feat/web-2d-enhancements | Build: 🟢 frontend · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Triển khai Nâng cấp Web 2D (`D-029`) — xong Phase 1–3/5, đang vào Phase 4**
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/web-2d-enhancements.md

## Đang làm dở
- Đã hoàn tất **Phase 1, Phase 2 & Phase 3**:
  1. Worker & D1: `0005_bookmarks.sql`, `bookmarksDb.ts`, `weeklyPopular.ts`, `guestSearch.ts`, `r2Files.ts`, `bookmarksApi.ts`.
  2. Giao diện Trang chủ & Thư viện 2D: cặp 2 dải biên tập `EditorialBookStrip.tsx` (*Thịnh hành tuần này* theo từng Tập & *Mới cập nhật gần đây*), thanh lọc/sắp xếp `LibraryFilterBar.tsx`, nhãn `MỚI`, yêu thích cục bộ `useGuestLocalFavorites.ts` và gỡ nhanh khỏi *Tiếp tục đọc*.
  3. Thông tin sách & Thống kê đọc 2D: tách `readingStats.ts` dùng chung 2D/3D (0 `three`), tạo `BookInfoModal.tsx` (`description` + Đánh dấu đọc xong + Đặt lại tiến độ), hiện mô tả bộ trên Hero `ShelfDetailView.tsx`, tạo `ReadingStatsModal.tsx` (`Library2DDialogsHost` nạp lười) và tách `ActiveReaderHost.tsx` giữ `App.tsx` gọn nhẹ.

## Bước tiếp theo
1. **Phase 4:** Tạo `nextVolume.ts` + `ReaderChapterEndNav.tsx` (nút *Đọc tiếp Tập kế →* cuối sách), chế độ `Immersive Mode` tự ẩn thanh công cụ và phím tắt `/`, `Ctrl+K`, `M`, `B`, `F`.
2. **Phase 5:** Tạo `ReaderImageLightbox.tsx` (zoom ảnh DOM cho `owner` & `<canvas>` thuỷ vân cho `guest`) + mở rộng `ReaderTocDrawer` với tab *Tìm trong sách* & *Dấu trang*.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
