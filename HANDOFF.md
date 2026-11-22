# HANDOFF
Cập nhật: 2026-11-22 22:36 | Nhánh: feat/shelf-member-access | Build: 🟢 frontend (`85.77 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất Phân quyền Đọc theo Bộ (`D-030`), sửa treo `CompressionStream` & sửa tràn chữ sát lề tiêu đề modal khi tên bộ truyện dài**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/shelf-member-access.md

## Đang làm dở
- Đã hoàn tất **Phase 1 → Phase 3 (`D-030`)** + bản vá đồng bộ gói bảo mật (`D-028`) + sửa tràn tiêu đề modal trên nhánh `feat/shelf-member-access` (Worker & D1 đã deploy live):
  1. **Worker & D1 (`0006_shelf_access.sql`, `shelfAccessDb.ts`, `adminRoutes.ts`, `booksDb.ts`):** bảng `shelf_access_rules` + `shelf_guest_grants` đã migrate trên `library-db` remote, trả `guest_locked` / `shelfAccess` và chặn cứng `403 Forbidden` ở mọi API khách.
  2. **Giao diện Bìa gắn Ổ khoá & Cửa sổ Quản trị (`ShelfAccessModal.tsx`, `ShelfAccessMemberList.tsx`, `BookCard.tsx`, `EditorialBookStrip.tsx`, `ShelfCoverCard.tsx`, `ShelfDetailView.tsx`, `BookInfoModal.tsx`):** hiện bìa kèm ổ khoá `🔒 Giới hạn` cho khách không thuộc danh sách; Admin tick thành viên / dán `Discord User ID` / sao chép từ bộ khác 1 chạm.
  3. **Sửa treo đóng gói bảo mật sách gộp chương lớn (`guestPackBuilder.ts`, `parsers.ts`, `AdminProtectionModal.tsx`):** đổi sang `Blob.stream().pipeThrough(CompressionStream)` chống deadlock Chromium khi chương > 500 KB, tự chia đoạn chương khổng lồ (`> 260` khối), bỏ giải nén ảnh thừa (`skipMediaBlobs`) & bỏ ghi tràn IndexedDB khi đồng bộ hàng loạt.
  4. **Sửa tràn chữ sát lề header modal (`ShelfBatchNoteModal.tsx`, `ShelfCoverPickerModal.tsx`, `ShelfAccessModal.tsx`):** thêm `min-w-0 flex-1` cho khối tiêu đề và `shrink-0` cho nút đóng `X`, tách dòng thống kê `Trống ghi chú / Chưa rõ tác giả` khỏi tên bộ truyện để không bao giờ bị cắt hay đẩy lệch nút đóng.

## Bước tiếp theo
1. Mở Pull Request `feat/shelf-member-access` vào `main` và bấm Merge khi CI xanh để đưa bản vá đồng bộ + phân quyền lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/web-2d-enhancements` (`D-029`):** Hoàn tất 5 Phase nâng cấp giao diện & trình đọc 2D + sửa nhận diện tiêu đề phụ tập.
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
