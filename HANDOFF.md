# HANDOFF
Cập nhật: 2026-11-22 10:32 | Nhánh: feat/guest-content-protection | Build: 🟢 frontend (entry <= 86.04 kB gzip, 0 B three) · 🟢 worker (live) · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Hoàn tất & đồng bộ `origin/main` (PR #9) vào `feat/guest-content-protection` (`D-028`)** — sẵn sàng bấm Merge PR trên GitHub.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/guest-content-protection.md

## Đang làm dở
- Đã hợp nhất sạch `origin/main` (gồm PR #9 `fix/native-gate-ui` cổng vòm `GateBackdropArt`) vào nhánh `feat/guest-content-protection` (`D-028`) và đã deploy live Cloudflare Worker (`arcane-library-api`):
  1. **Worker (`guestPack.ts`, `forensicWatermark.ts`, `progressDb.ts`):** khoá `403` `/api/files/books/*` với `guest`, ẩn `file_key`, gắn `ua_hash`, Token Bucket chống bot (`burst = 10`, hồi `1 chương / 6s`, không trần ngày), cắt byte-range từng chương & ảnh từ R2 mã hoá `AES-256-GCM` và nhúng thuỷ vân 32-bit theo `discord_user_id`.
  2. **Đóng gói `GuestPack` (`zipDirectory.ts`, `guestPackBuilder.ts`, `guestCrypto.ts`):** trích toạ độ ảnh trực tiếp trong ZIP (`0 B` nhân bản ảnh), tự sinh gói khi upload `EPUB`/`DOCX` mới & ngắt lưu IndexedDB sách ở chế độ `guest`.
  3. **Trình đọc `<canvas>` 2D (`GuestCanvasReader.tsx`):** DOM 0 chữ/ảnh, khoá `toDataURL`/`toBlob`, phủ vân giấy sóng độ sáng chống tách nền Tesseract OCR + thuỷ vân nổi `discord_username · #xxxx`; Admin giữ nguyên 100% `ReaderView` DOM + Cache `0ms`.
  4. **Bảng Bảo mật Admin (`AdminProtectionModal.tsx`, `AdminModalsHost.tsx`):** nút Khiên trên `LibraryHeader` để đồng bộ 1 chạm sách `EPUB`/`DOCX` cũ trên R2, quét văn bản truy vết thủ phạm Discord & khoá/mở khoá tức thì.

## Bước tiếp theo
1. Bấm **Merge pull request** trên GitHub khi CI chạy lại xanh (đã hết conflict).
2. Sau khi `ofu.lol` cập nhật, bấm nút **Khiên** trên Header → bấm **Đồng bộ sách chưa có gói** 1 lần cho các sách `EPUB`/`DOCX` cũ.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **`feat/guest-content-protection` (`D-028`):** Hoàn tất 4 Phase + deploy live Worker + giải quyết conflict với PR #9 (`fix/native-gate-ui`).
- **PR #9 (`fix/native-gate-ui`, `D-027`):** đã merge vào `main`.
