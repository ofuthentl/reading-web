# HANDOFF
Cập nhật: 2026-11-22 21:51 | Nhánh: feat/shelf-member-access | Build: 🟢 frontend (`<= 86.04 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Triển khai Phân quyền Đọc theo Bộ cho Thành viên Discord chỉ định & Hiển thị Bìa gắn Ổ khoá (`D-030`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/shelf-member-access.md

## Đang làm dở
- Đã hoàn tất **Phase 1 & Phase 2 (`D-030`)** trên nhánh `feat/shelf-member-access`:
  1. Bảng D1 `shelf_access_rules` + `shelf_guest_grants` (`0006_shelf_access.sql`, `shelfAccessDb.ts`, `adminRoutes.ts`) tự khởi tạo an toàn, tự gộp quyền khi đổi tên kệ và chặn cứng `403 Forbidden` ở toàn bộ API khách.
  2. Giao diện 2D (`BookCard`, `EditorialBookStrip`, `ShelfCoverCard`, `ShelfDetailView`, `BookInfoModal`, `useBookReader`, `nextVolume`): giữ nguyên ảnh bìa sắc nét nhưng đính biểu tượng ổ khoá `🔒 Giới hạn` rõ ràng cho khách không thuộc danh sách được cấp quyền, chặn mở lịch sự & tự bỏ qua tập bị khoá khi chuyển tập kế.

## Bước tiếp theo
1. Triển khai **Phase 3**: cửa sổ quản trị `ShelfAccessModal` trên Hero kệ & thẻ kệ + nối state `shelfAccess` và cập nhật `docs/ARCHITECTURE.md`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/web-2d-enhancements` (`D-029`):** Hoàn tất 5 Phase nâng cấp giao diện & trình đọc 2D + sửa nhận diện tiêu đề phụ tập.
- **PR #10 (`feat/guest-content-protection`, `D-028`):** đã merge vào `main`.
