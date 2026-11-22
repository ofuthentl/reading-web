# HANDOFF
Cập nhật: 2026-11-22 23:07 | Nhánh: feat/shelf-member-access | Build: 🟢 frontend (`85.33 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất Phân quyền Đọc theo Bộ (`D-030`), sửa treo `CompressionStream` & chuẩn hoá tỉ lệ ảnh bìa `7:10` không cắt xén kèm tự động đồng bộ ngầm toàn kho (`D-031`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/cover-aspect-ratio.md

## Đang làm dở
- Đã hoàn tất **`D-030` + `D-031`** trên nhánh `feat/shelf-member-access` (Worker & D1 đã deploy live):
  1. **Worker & D1 (`0006_shelf_access.sql`, `shelfAccessDb.ts`, `adminRoutes.ts`, `booksDb.ts`):** bảng `shelf_access_rules` + `shelf_guest_grants` đã migrate trên `library-db` remote, trả `guest_locked` / `shelfAccess` và chặn cứng `403 Forbidden` ở mọi API khách.
  2. **Giao diện Bìa gắn Ổ khoá & Cửa sổ Quản trị (`ShelfAccessModal.tsx`, `ShelfAccessMemberList.tsx`, `BookCard.tsx`, `EditorialBookStrip.tsx`, `ShelfCoverCard.tsx`, `ShelfDetailView.tsx`, `BookInfoModal.tsx`):** hiện bìa kèm ổ khoá `🔒 Giới hạn` cho khách không thuộc danh sách; Admin tick thành viên / dán `Discord User ID` / sao chép từ bộ khác 1 chạm.
  3. **Sửa treo đóng gói bảo mật (`guestPackBuilder.ts`, `parsers.ts`, `AdminProtectionModal.tsx`) & tràn chữ header modal (`ShelfBatchNoteModal.tsx`, `ShelfCoverPickerModal.tsx`, `ShelfAccessModal.tsx`):** dùng `Blob.stream().pipeThrough(CompressionStream)`, chia đoạn chương khổng lồ, thêm `min-w-0 flex-1` chống đẩy lệch nút đóng.
  4. **Chuẩn hoá tỉ lệ bìa `7:10` & tự động đồng bộ ngầm 1 lần (`D-031` — `coverImage.ts`, `legacyCoverSync.ts`, `useLibraryDataStore.ts` + toàn bộ thẻ/modal 2D):** bỏ crop cứng `480×720`, giữ nguyên tỉ lệ gốc của ảnh bìa (`-v2.jpg`), đổi khung UI sang `aspect-[7/10]` chuẩn Light Novel A6 / PDF A4 và tự khôi phục ngầm toàn bộ bìa cũ khi Admin mở trang (`0` nút thừa, `0` đụng chạm `guest-packs`).

## Bước tiếp theo
1. Mở Pull Request `feat/shelf-member-access` vào `main` và bấm Merge khi CI xanh để đưa bản vá đồng bộ + phân quyền lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/web-2d-enhancements` (`D-029`):** Hoàn tất 5 Phase nâng cấp giao diện & trình đọc 2D + sửa nhận diện tiêu đề phụ tập.
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
