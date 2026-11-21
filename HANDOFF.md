# HANDOFF
Cập nhật: 2026-11-22 02:20 | Nhánh: feat/guest-content-protection | Build: 🟢 frontend · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Triển khai chống Crawl / Đánh cắp nội dung ở chế độ `guest` (`feat/guest-content-protection`, `D-028`)** — xong Phase 1 & 2, đang sang Phase 3.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/guest-content-protection.md

## Đang làm dở
- **Phase 1 (XONG):** Hạ tầng Cloudflare Worker (`0004_guest_protection.sql`, `forensicWatermark.ts`, `guestPack.ts`, `progressDb.ts`, khoá `403` `/api/files/books/*`, Token Bucket không trần ngày, mã hoá phiên `AES-256-GCM` & thuỷ vân 32-bit).
- **Phase 2 (XONG):** Bộ đóng gói `GuestPack` (`zipDirectory.ts`, `guestPackBuilder.ts`, `guestCrypto.ts`, cập nhật `types.ts`, `parsers.ts`, `docxParser.ts`, `authSession.ts`, `bookMetadata.ts`, `api.ts`) — đọc toạ độ ảnh trực tiếp trong ZIP (`0 B` nhân bản ảnh trên R2), tự tạo gói khi upload `EPUB`/`DOCX` & ngắt cache IndexedDB sách cho `guest`.
- **Đang triển khai Phase 3:** Trình đọc `<canvas>` 2D nhiễu vân giấy + thuỷ vân nổi `discord_username` (`guestCanvasLayout.ts`, `guestCanvasPaint.ts`, `GuestCanvasReader.tsx`).

## Bước tiếp theo
1. Hoàn tất Phase 3 (`GuestCanvasReader` nạp lười `0 B` ở entry, nối `useBookReader.ts` & `App.tsx`).
2. Triển khai Phase 4 (`AdminProtectionModal` đồng bộ 1 chạm cho sách cũ + truy vết rò rỉ Discord + kiểm định E2E).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 2 (`feat/guest-content-protection`, `D-028`):** Đóng gói chương nén + bảng offset ZIP ảnh & giải mã `AES-256-GCM` trên RAM.
- **Phase 1 (`feat/guest-content-protection`, `D-028`):** Hạ tầng Worker bảo vệ nội dung `guest`.
