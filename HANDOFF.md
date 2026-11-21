# HANDOFF
Cập nhật: 2026-11-21 23:52 | Nhánh: feat/discord-key-access | Build: 🟢 frontend (entry 83.41 kB gzip <= 86.04 kB, 0 B three) · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Chia sẻ thư viện qua Bot Discord (`feat/discord-key-access`, `D-026`)** — đã xong Phase 1, 2, 3; đang chạy kiểm thử E2E & hoàn tất tài liệu Phase 4.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/discord-key-access.md

## Đang làm dở
- **Phase 1 (XONG):** D1 schema `0003_discord_guest_access.sql`, auth `owner` (30d) vs `guest` (24h single-session từ key 5 phút), chặn `403` kho chung & cách ly `guest_reading_progress`.
- **Phase 2 (XONG):** Discord HTTP Interactions (`Ed25519`, `/setup-bell`, `/key`, nút `🔔 Nhận chìa khoá`) + script đăng ký lệnh.
- **Phase 3 (XONG):**
  - Tách gọn `src/lib/authSession.ts` quản lý token/phiên & HTTP client (giữ `src/lib/api.ts` < 500 dòng).
  - Giữ nguyên UI `AuthGate.tsx` nhận chung `ACCESS_PASSCODE` & Key Discord 12 ký tự.
  - Khoá cứng `guest` ở **Chỉ Đọc 2D** trong `App.tsx`, `LibraryHeader.tsx`, `Library2DView.tsx`, `LibraryCatalogView.tsx` (không tải `three`, ẩn toàn bộ nút quản trị, hiện đếm ngược phiên 24 giờ & tự thoát khi hết giờ).
- **Đang làm (Phase 4):** chạy kiểm thử E2E trên `workerd` + D1 thực tế & cập nhật `docs/ARCHITECTURE.md`.

## Bước tiếp theo
1. Chạy bộ kiểm thử E2E (`workerd` + D1 + `Ed25519`), kiểm tra đầy đủ checklist trong `docs/plans/discord-key-access.md`.
2. Cập nhật `docs/ARCHITECTURE.md` + `docs/plans/discord-key-access.md` + `HANDOFF.md` và sẵn sàng deploy/mở PR.

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 3 (`feat/discord-key-access`):** Frontend nhận Key Discord, khoá `guest` Chỉ Đọc 2D & tự động thoát khi hết hạn 24 giờ.
- **Phase 2 (`feat/discord-key-access`):** Discord HTTP Interactions webhook + `/setup-bell`.
- **Phase 1 (`feat/discord-key-access`):** D1 schema + phân quyền `owner`/`guest` + cách ly tiến độ đọc.
