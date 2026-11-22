# HANDOFF
Cập nhật: 2026-11-22 23:57 | Nhánh: fix/mobile-admin-header | Build: 🟢 frontend (`<= 86.04 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Chống tràn header Admin trên điện thoại (dời nút `Bảo mật` & `Chọn` xuống cạnh ô tìm kiếm trên mobile) & gỡ thanh phân loại tệp (`Mọi tệp / EPUB / PDF / DOCX`)**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/cover-aspect-ratio.md

## Đang làm dở
- Trên nhánh `fix/mobile-admin-header` (tách từ `origin/main` sau PR #13):
  1. **Gọn header Admin trên điện thoại (`LibraryHeader.tsx`, `LibraryFilterBar.tsx`, `Library2DView.tsx`, `LibraryCatalogView.tsx`):** ẩn nút `Bảo mật` và `Chọn` trên thanh header dưới `sm:` (`hidden sm:inline-flex`), chuyển xuống nằm ngay bên phải ô `Tìm kiếm` trên mobile (`sm:hidden`) giúp header Admin vừa khít mọi màn hình iPhone (`0px` tràn ngang).
  2. **Gỡ thanh lọc phân loại tệp (`LibraryFilterBar.tsx`):** xoá cụm `Mọi tệp | EPUB | PDF | DOCX` khỏi trang để giao diện lọc gọn gàng.

## Bước tiếp theo
1. Mở Pull Request `fix/mobile-admin-header` vào `main` và bấm Merge khi CI xanh để đưa lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #13 (`feat/miku-cursors`):** Bộ con trỏ động 12 khung Hatsune Miku & cân chiều cao nút huy hiệu đã merge vào `main`.
- **PR #12 (`D-031`)** & **PR #11 (`D-030`):** đã merge vào `main`.
