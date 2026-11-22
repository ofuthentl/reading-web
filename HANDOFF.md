# HANDOFF
Cập nhật: 2026-11-23 00:14 | Nhánh: fix/mobile-admin-header | Build: 🟢 frontend (`<= 86.04 kB` gzip, `0 B` three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Gọn header Admin trên điện thoại, gỡ bộ lọc tệp & tối ưu cuộn mượt 120–144 FPS cho kho 250+ sách trên Brave/Chromium**.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/scroll-performance-2d.md

## Đang làm dở
- Trên nhánh `fix/mobile-admin-header` (tách từ `origin/main` sau PR #13):
  1. **Gọn header Admin trên điện thoại & gỡ lọc định dạng (`LibraryHeader.tsx`, `LibraryFilterBar.tsx`, `Library2DView.tsx`, `LibraryCatalogView.tsx`):** dời nút `Bảo mật` + `Chọn` xuống sát ô tìm kiếm trên mobile (`sm:hidden`), bỏ cụm `Mọi tệp | EPUB | PDF | DOCX`.
  2. **Tối ưu cuộn mượt 120–144 FPS (`index.css`, `useCardReveal.ts`, `mikuCursorAnimator.ts`, `BookCard.tsx`, `legacyCoverSync.ts`):** thay `background-attachment: fixed` bằng lớp tĩnh `position: fixed`, chỉ bật `data-tilting` + `mix-blend-mode: soft-light` trên đúng 1 thẻ đang hover (khoá tilt & cache `DOMRect` khi cuộn), đổi trình phát Miku sang gắn inline `style.cursor` trên 1 phần tử đang trỏ + tạm ngắt khi cuộn (`0` `RecalcStyle` toàn trang), bật `content-visibility: auto` cho 58 kệ sách và gom lô đồng bộ bìa.

## Bước tiếp theo
1. Mở Pull Request `fix/mobile-admin-header` vào `main` và bấm Merge khi CI xanh để đưa lên `ofu.lol`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #13 (`feat/miku-cursors`):** Bộ con trỏ động 12 khung Hatsune Miku & cân chiều cao nút huy hiệu đã merge vào `main`.
- **PR #12 (`D-031`)** & **PR #11 (`D-030`):** đã merge vào `main`.
