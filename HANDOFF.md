# HANDOFF
Cập nhật: 2026-11-22 02:15 | Nhánh: feat/guest-content-protection | Build: 🟢 frontend · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Triển khai chống Crawl / Đánh cắp nội dung ở chế độ `guest` (`feat/guest-content-protection`, `D-028`)** — xong Phase 1, đang sang Phase 2.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/guest-content-protection.md

## Đang làm dở
- **Phase 1 (XONG):** Hạ tầng bảo vệ trên Cloudflare Worker (`0004_guest_protection.sql`, `forensicWatermark.ts`, `guestPack.ts`, `progressDb.ts`, cập nhật `auth.ts`, `discord.ts`, `booksDb.ts`, `index.ts`):
  - Khoá cứng `403` cho `guest` tại `GET /api/files/books/*`, ẩn `file_key` trong `GET /api/books`.
  - Gắn phiên `guest` với `ua_hash`, kiểm tra `is_banned`, Token Bucket chống bot (`burst = 10`, hồi `1 chương / 6s`, không trần ngày).
  - Cắt byte-range từng chương & ảnh từ R2 mã hoá `AES-256-GCM` theo phiên, nhúng thuỷ vân 32-bit theo `discord_user_id` & thêm API Admin truy vết rò rỉ / khoá tài khoản.
- **Đang triển khai Phase 2:** Bộ đóng gói `GuestPack` (`zipDirectory.ts`, `guestPackBuilder.ts`, `guestCrypto.ts`) và tích hợp lúc upload sách `EPUB`/`DOCX`.

## Bước tiếp theo
1. Hoàn tất Phase 2 (`zipDirectory.ts`, `guestPackBuilder.ts`, `guestCrypto.ts`, cập nhật `types.ts`, `cache.ts`, `api.ts`).
2. Triển khai Phase 3 (`GuestCanvasReader` nhiễu vân giấy + thuỷ vân nổi `discord_username`).
3. Triển khai Phase 4 (`AdminProtectionModal` đồng bộ 1 chạm + truy vết rò rỉ + kiểm định E2E).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 1 (`feat/guest-content-protection`, `D-028`):** Hạ tầng Worker chống tải file gốc, mã hoá chương/ảnh `AES-256-GCM`, Token Bucket & thuỷ vân 32-bit.
- **PR #8 (`feat/entrance-and-locked-routes`, `D-027`):** đã merge vào `main`.
