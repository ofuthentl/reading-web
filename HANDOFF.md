# HANDOFF
Cập nhật: 2026-11-22 21:51 | Nhánh: feat/shelf-member-access | Build: 🟢 frontend (`<= 86.04 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Triển khai Phân quyền Đọc theo Bộ cho Thành viên Discord chỉ định & Hiển thị Bìa gắn Ổ khoá (`D-030`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/shelf-member-access.md

## Đang làm dở
- Đã hoàn tất **Phase 1 (`D-030`)** trên nhánh `feat/shelf-member-access`:
  1. Bảng D1 `shelf_access_rules` + `shelf_guest_grants` (`0006_shelf_access.sql`, `shelfAccessDb.ts`, `adminRoutes.ts`) tự khởi tạo an toàn và tự hợp nhất giữ quyền khi đổi tên kệ.
  2. Chốt chặn cứng `403 Forbidden` qua `assertGuestBookAccess` ở toàn bộ API mục lục, chương, ảnh, tìm kiếm, tiến độ & dấu trang của `guest`, kèm trả cờ `guest_locked` + `shelfAccess` trong `GET /api/books` và client `shelfAccessApi.ts`.

## Bước tiếp theo
1. Triển khai **Phase 2**: hiển thị huy hiệu ổ khoá `🔒 Giới hạn` trên bìa sách & kệ cho `guest`, chặn mở lịch sự ở `useBookReader`, `ShelfDetailView`, `BookInfoModal` & `findNextBookInShelf`.
2. Triển khai **Phase 3**: cửa sổ quản trị `ShelfAccessModal` trên Hero kệ + cập nhật `docs/ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/web-2d-enhancements` (`D-029`):** Hoàn tất 5 Phase nâng cấp giao diện & trình đọc 2D + sửa nhận diện tiêu đề phụ tập.
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
