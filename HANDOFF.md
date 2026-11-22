# HANDOFF
Cập nhật: 2026-11-22 22:03 | Nhánh: feat/shelf-member-access | Build: 🟢 frontend (`<= 86.04 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất trọn bộ 3 Phase Phân quyền Đọc theo Bộ cho Thành viên Discord chỉ định & Hiển thị Bìa gắn Ổ khoá (`D-030`)** — sẵn sàng deploy Worker & mở PR.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/shelf-member-access.md

## Đang làm dở
- Đã hoàn tất trọn vẹn **Phase 1 → Phase 3 (`D-030`)** trên nhánh `feat/shelf-member-access`:
  1. **Worker & D1 (`0006_shelf_access.sql`, `shelfAccessDb.ts`, `adminRoutes.ts`, `booksDb.ts`):** bảng `shelf_access_rules` + `shelf_guest_grants` tự khởi tạo an toàn, tự hợp nhất giữ quyền khi đổi tên kệ, trả `guest_locked` / `shelfAccess` trong `GET /api/books` và chặn cứng `403 Forbidden` ở mọi API mục lục, chương, ảnh, tìm kiếm, tiến độ & dấu trang của `guest`.
  2. **Giao diện Bìa gắn Ổ khoá cho Khách (`BookCard.tsx`, `EditorialBookStrip.tsx`, `ShelfCoverCard.tsx`, `ShelfDetailView.tsx`, `BookInfoModal.tsx`, `useBookReader.ts`, `nextVolume.ts`):** giữ nguyên ảnh bìa sắc nét kèm biểu tượng ổ khoá `🔒 Giới hạn` cho khách không thuộc danh sách được cấp quyền, hiện thông báo khoá lịch sự & tự bỏ qua tập bị khoá ở *Đọc tiếp Tập kế*.
  3. **Cửa sổ Quản trị Phân quyền Kệ (`ShelfAccessModal.tsx`, `ShelfAccessMemberList.tsx`, `LibraryCatalogView.tsx`, `shelfAccessApi.ts`):** nút **`Phân quyền`** trên Hero kệ & nút `🔒` trên thẻ kệ trong Tab Thư viện (`0 B` tăng thêm ở entry bundle), hỗ trợ tick chọn thành viên Discord, cấp trước bằng `Discord User ID` và sao chép nhóm người đọc từ bộ khác 1 chạm.

## Bước tiếp theo
1. Chạy `npx wrangler deploy` trong `workers/r2-storage` để cập nhật Worker (bảng `shelf_access_rules` & `shelf_guest_grants` tự khởi tạo an toàn ngay request đầu).
2. Push nhánh và mở Pull Request hợp nhất vào `main`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/web-2d-enhancements` (`D-029`):** Hoàn tất 5 Phase nâng cấp giao diện & trình đọc 2D + sửa nhận diện tiêu đề phụ tập.
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
