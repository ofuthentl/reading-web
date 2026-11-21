# HANDOFF
Cập nhật: 2026-11-22 02:05 | Nhánh: feat/guest-content-protection | Build: 🟢 frontend (entry 83.41 kB <= 86.04 kB gzip, 0 B three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Lập kế hoạch chống Crawl / Đánh cắp nội dung ở chế độ `guest` (`feat/guest-content-protection`, `D-028`)** — chờ người dùng duyệt plan trước khi code Phase 1.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/guest-content-protection.md

## Đang làm dở
- Đã tách nhánh mới `feat/guest-content-protection` từ `main` (sau khi PR #8 `feat/entrance-and-locked-routes` đã merge vào `main`).
- Đã ghi quyết định kiến trúc **`D-028`** vào `docs/DECISIONS.md` và hoàn tất bản kế hoạch chi tiết 4 Phase tại `docs/plans/guest-content-protection.md`:
  - **Phase 1:** Hạ tầng Worker (`0004_guest_protection.sql`, khoá `403` `/api/files/books/*` với `guest`, Token Bucket chống bot không giới hạn tổng chương/ngày, cắt byte-range chương/ảnh từ R2 mã hoá `AES-256-GCM`, nhúng & truy vết thuỷ vân ẩn 32-bit theo `discord_user_id`).
  - **Phase 2:** Bộ đóng gói `GuestPack` cho `EPUB` & `DOCX` (`0 B` nhân bản ảnh nhờ bảng offset ZIP) + tự tạo khi Admin upload sách & ngắt IndexedDB sách cho `guest`.
  - **Phase 3:** Trình đọc `<canvas>` 2D nhiễu vân giấy + thuỷ vân nổi `discord_username` (`GuestCanvasReader` nạp lười `0 B` ở entry; Admin giữ nguyên 100% `ReaderView` DOM + Cache `0ms`).
  - **Phase 4:** Modal Bảo mật Admin (`AdminProtectionModal`: đồng bộ 1 chạm cho sách cũ trên R2 + quét văn bản truy vết thủ phạm Discord + khoá/mở khoá tài khoản) & kiểm thử E2E.

## Bước tiếp theo
1. Chờ người dùng duyệt `docs/plans/guest-content-protection.md`.
2. Sau khi được duyệt: triển khai lần lượt Phase 1 → Phase 4, mỗi Phase commit riêng kèm kiểm định xanh và cập nhật `HANDOFF.md`.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **PR #8 (`feat/entrance-and-locked-routes`, `D-027`):** đã merge vào `main` (tách cổng `/entrance` & `/locked`).
- **PR #7 (`feat/discord-key-access`, `D-026`):** đã merge vào `main`.
