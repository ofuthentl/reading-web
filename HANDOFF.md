# HANDOFF
Cập nhật: 2026-11-22 02:35 | Nhánh: feat/guest-content-protection | Build: 🟢 frontend (entry 77.11 kB <= 86.04 kB gzip, 0 B three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất bảo vệ nội dung chống Crawl / Đánh cắp cho chế độ `guest` (`feat/guest-content-protection`, `D-028`)** — sẵn sàng deploy Worker & mở PR vào `main`.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/guest-content-protection.md

## Đang làm dở
- Đã hoàn tất trọn vẹn cả 4 Phase trên nhánh `feat/guest-content-protection` (`D-028`) và vượt 100% 9 bài E2E (`workerd + D1 + R2`):
  1. **Worker (`0004_guest_protection.sql`, `guestPack.ts`, `forensicWatermark.ts`, `progressDb.ts`):** khoá `403` `/api/files/books/*` với `guest`, ẩn `file_key`, ràng buộc `ua_hash`, Token Bucket chống bot (`burst = 10`, hồi `1 chương / 6s`, không giới hạn tổng chương/ngày), cắt byte-range từng chương & ảnh từ R2 mã hoá `AES-256-GCM` và nhúng thuỷ vân 32-bit theo `discord_user_id`.
  2. **Đóng gói `GuestPack` (`zipDirectory.ts`, `guestPackBuilder.ts`, `guestCrypto.ts`):** trích toạ độ ảnh trực tiếp trong ZIP (`0 B` nhân bản ảnh), tự sinh gói khi upload `EPUB`/`DOCX` mới & ngắt lưu IndexedDB sách ở chế độ `guest`.
  3. **Trình đọc `<canvas>` 2D (`GuestCanvasReader.tsx`):** DOM 0 chữ/ảnh, khoá `toDataURL`/`toBlob`, phủ vân giấy sóng độ sáng chống tách nền Tesseract OCR + thuỷ vân nổi `discord_username · #xxxx`; Admin giữ nguyên 100% `ReaderView` DOM + Cache `0ms`.
  4. **Bảng Bảo mật Admin (`AdminProtectionModal.tsx`, `AdminModalsHost.tsx`):** nút Khiên trên `LibraryHeader` để đồng bộ 1 chạm sách `EPUB`/`DOCX` cũ trên R2, quét văn bản truy vết thủ phạm Discord (đạt 100% khớp kênh dấu thanh kể cả sau AI OCR) & khoá/mở khoá tức thì.

## Bước tiếp theo
1. Deploy cập nhật Cloudflare Worker (`cd workers/r2-storage && npx wrangler d1 migrations apply library-db --remote && npx wrangler deploy`; Worker cũng đã có cơ chế tự nâng cấp bảng/cột an toàn).
2. Mở & merge Pull Request `feat/guest-content-protection` → `main`.
3. Đăng nhập Admin trên `ofu.lol` → bấm biểu tượng **Khiên** trên thanh Header → bấm **Đồng bộ sách chưa có gói** 1 lần cho các cuốn `EPUB`/`DOCX` đã tải lên từ trước.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/guest-content-protection` (`D-028`):** Hoàn tất bảo vệ 4 lớp chống crawl/OCR & truy vết rò rỉ Discord (giảm gói entry từ `83.41 kB` xuống `77.11 kB gzip`).
- **PR #8 (`feat/entrance-and-locked-routes`, `D-027`):** đã merge vào `main`.
