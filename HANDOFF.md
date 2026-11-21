# HANDOFF
Cập nhật: 2026-11-22 02:28 | Nhánh: feat/guest-content-protection | Build: 🟢 frontend (entry 81.50 kB <= 86.04 kB gzip, 0 B three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Triển khai chống Crawl / Đánh cắp nội dung ở chế độ `guest` (`feat/guest-content-protection`, `D-028`)** — xong Phase 1, 2 & 3, đang sang Phase 4.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/guest-content-protection.md

## Đang làm dở
- **Phase 1 (XONG):** Hạ tầng Cloudflare Worker (`0004_guest_protection.sql`, `forensicWatermark.ts`, `guestPack.ts`, `progressDb.ts`, khoá `403` `/api/files/books/*`, Token Bucket không trần ngày, mã hoá phiên `AES-256-GCM` & thuỷ vân 32-bit).
- **Phase 2 (XONG):** Bộ đóng gói `GuestPack` (`zipDirectory.ts`, `guestPackBuilder.ts`, `guestCrypto.ts`) — đọc toạ độ ảnh trực tiếp trong ZIP (`0 B` nhân bản ảnh trên R2), tự tạo gói khi upload `EPUB`/`DOCX` & ngắt cache IndexedDB sách cho `guest`.
- **Phase 3 (XONG):** Trình đọc `<canvas>` 2D nhiễu vân giấy (`guestCanvasLayout.ts`, `guestCanvasPaint.ts`, `useGuestChapterStream.ts`, `GuestCanvasReader.tsx`, cập nhật `useBookReader.ts`, `App.tsx`, `index.css`) — DOM 0 chữ/ảnh, khoá `toDataURL`/`toBlob`, thuỷ vân chéo `discord_username`, cache RAM 12 chương `0ms`, Admin giữ nguyên 100% `ReaderView` DOM.
- **Đang triển khai Phase 4:** Modal Bảo mật Admin (`AdminProtectionModal.tsx`: đồng bộ 1 chạm cho sách cũ + truy vết rò rỉ Discord + khoá/mở khoá) & bộ test E2E tự động.

## Bước tiếp theo
1. Hoàn tất Phase 4 (`AdminProtectionModal.tsx`, nối `LibraryHeader.tsx` & `App.tsx`, viết test tự động toàn diện, cập nhật `ARCHITECTURE.md`, `guest-content-protection.md` & `HANDOFF.md`).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 3 (`feat/guest-content-protection`, `D-028`):** Trình đọc `<canvas>` 2D nhiễu vân giấy & thuỷ vân nổi cho `guest` (entry `81.50 kB gzip`).
- **Phase 2 (`feat/guest-content-protection`, `D-028`):** Đóng gói chương nén + bảng offset ZIP ảnh & giải mã `AES-256-GCM`.
