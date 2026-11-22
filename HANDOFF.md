# HANDOFF
Cập nhật: 2026-11-22 11:00 | Nhánh: feat/web-2d-enhancements | Build: 🟢 frontend · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Triển khai Nâng cấp Web 2D (`D-029`) — xong Phase 1/5, đang vào Phase 2**
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/web-2d-enhancements.md

## Đang làm dở
- Đã chốt **`D-029`** (`PA-1A` xếp trực tiếp theo Tập + cặp 2 dải *Thịnh hành tuần này* & *Mới cập nhật*, `PA-2A`, `PA-3A`) và hoàn tất **Phase 1 — Hạ tầng Worker & D1**:
  1. Migration `0005_bookmarks.sql` + `bookmarksDb.ts` (`GET/POST/DELETE /api/books/:id/bookmarks` cách ly `owner` vs `guest:<discord_user_id>`).
  2. Xếp hạng từng tập sách thịnh hành 7 ngày (`weeklyPopular.ts`) trả kèm trong `GET /api/books`.
  3. Tìm kiếm chương chứa từ khoá an toàn cho `guest` (`guestSearch.ts`, 0 đoạn văn bản thô lộ ra ngoài) + tách `r2Files.ts` gọn dưới trần 500 dòng.
  4. Cập nhật `src/types.ts`, `src/lib/api.ts` và tạo `src/lib/bookmarksApi.ts`.

## Bước tiếp theo
1. **Phase 2:** Tạo `EditorialBookStrip.tsx` (cho cả *Thịnh hành tuần này* & *Mới cập nhật gần đây*), thanh Bộ lọc/Sắp xếp `LibraryFilterBar.tsx`, yêu thích cục bộ `localStorage` & nhãn gói bảo mật cho `guest`.
2. **Phase 3:** `BookInfoModal.tsx` (`description` + Đặt lại tiến độ / Đánh dấu đọc xong), mô tả kệ trên `ShelfDetailView` & `ReadingStatsModal.tsx`.
3. **Phase 4 & 5:** Đọc tiếp Tập kế, Immersive Mode, Phím tắt, Lightbox ảnh & Tìm chữ / Dấu trang trong trình đọc.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
