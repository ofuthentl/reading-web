# HANDOFF
Cập nhật: 2026-11-21 23:42 | Nhánh: feat/discord-key-access | Build: 🟢 frontend · 🟢 worker · 🟢 ESLint 0/0
Nhiệm vụ hiện tại: **Chia sẻ thư viện qua Bot Discord (`feat/discord-key-access`, `D-026`)** — đã xong Phase 1, chuyển sang Phase 2.
Sổ khác: AGENTS.md (luật) · docs/ARCHITECTURE.md · docs/DECISIONS.md · docs/plans/discord-key-access.md

## Đang làm dở
- **Phase 1 (XONG):**
  - Thêm migration `0003_discord_guest_access.sql` + cập nhật `schema.sql` (`discord_access`, `guest_reading_progress`).
  - Nâng cấp `workers/r2-storage/src/auth.ts`: phân quyền `owner` (30 ngày qua `ACCESS_PASSCODE`) vs `guest` (24 giờ qua key 12 ký tự hạn 5 phút dùng 1 lần, tự đóng phiên 24 giờ cũ của cùng Discord user).
  - Nâng cấp `booksDb.ts` & `index.ts`: chặn `403` mọi API ghi/xoá sách và kệ với `guest`, tách riêng tiến độ đọc khách vào `guest_reading_progress`.
- **Đang làm (Phase 2):** tạo `workers/r2-storage/src/discord.ts` xử lý `POST /api/discord/interactions` (`Ed25519` verify, `/setup-bell`, nút `🔔 Nhận chìa khoá`) + script đăng ký slash command.

## Bước tiếp theo
1. Hoàn tất Phase 2 (`discord.ts`, nối route vào `index.ts`, script `register-discord-commands.mjs`).
2. Triển khai Phase 3 (Frontend `authSession.ts`, `api.ts`, `AuthGate.tsx`, khoá cứng `guest` Chỉ Đọc 2D trong `App.tsx` / `LibraryHeader.tsx`).
3. Triển khai Phase 4 (Unit/integration test toàn luồng + cập nhật `docs/ARCHITECTURE.md` + hướng dẫn gắn Discord App).

## Lỗi / chặn
- Không có lỗi/chặn nào.

## Xong gần nhất
- **Phase 1 (`feat/discord-key-access`):** D1 schema, auth 2 vai trò `owner`/`guest`, khoá `403` và cách ly tiến độ đọc.
