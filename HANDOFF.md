# HANDOFF
Cập nhật: 2026-11-21 23:44 | Nhánh: feat/discord-key-access | Build: 🟢 frontend · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Chia sẻ thư viện qua Bot Discord (`feat/discord-key-access`, `D-026`)** — đã xong Phase 1 & Phase 2, chuyển sang Phase 3 (Frontend).
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/discord-key-access.md

## Đang làm dở
- **Phase 1 (XONG):** D1 schema `0003_discord_guest_access.sql`, auth `owner` (30d) vs `guest` (24h single-session từ key 5 phút), chặn `403` kho chung & cách ly `guest_reading_progress`.
- **Phase 2 (XONG):**
  - Tạo `workers/r2-storage/src/discord.ts`: xác thực `Ed25519` (`crypto.subtle`), xử lý `PING`, kiểm tra `DISCORD_GUILD_ID`, lệnh `/setup-bell` (Admin) đặt bảng chuông `🔔 Nhận chìa khoá`, lệnh `/key` & bấm nút cấp key ẩn 12 ký tự hạn 5 phút (cooldown `15s`).
  - Nối `POST /api/discord/interactions` vào `index.ts` và thêm script `workers/r2-storage/scripts/register-discord-commands.mjs`.
- **Đang làm (Phase 3):** cập nhật Frontend (`src/types.ts`, `src/lib/authSession.ts`, `src/lib/api.ts`, `AuthGate.tsx`, `App.tsx`, `LibraryHeader.tsx`, `Library2DView.tsx`, `LibraryCatalogView.tsx`) khoá `guest` Chỉ Đọc 2D & tự động thoát khi hết hạn 24 giờ.

## Bước tiếp theo
1. Hoàn tất Phase 3 (Frontend UI giữ nguyên thiết kế hiện có, khoá cứng Guest Chỉ Đọc 2D, đếm ngược phiên 24 giờ).
2. Triển khai Phase 4 (Unit/integration test toàn diện cho Worker/Auth/Discord + cập nhật `docs/ARCHITECTURE.md`).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 2 (`feat/discord-key-access`):** Discord HTTP Interactions webhook + `/setup-bell` + script đăng ký lệnh.
- **Phase 1 (`feat/discord-key-access`):** D1 schema + phân quyền `owner`/`guest` + cách ly tiến độ đọc.
